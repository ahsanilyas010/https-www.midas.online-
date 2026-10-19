"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { getZoomCredentials } from "@/lib/zoom/credentials";
import { createMeeting, deleteMeeting, getMeeting, ZoomError } from "@/lib/zoom/client";
import type { RealTables } from "@/lib/supabase/real-types";

export interface MeetingResult {
  error?: string;
  ok?: boolean;
  meeting?: { id: string; joinUrl: string; password: string | null; startTime: string; topic: string };
}

export type MeetingRow = RealTables<"zoom_meetings"> & {
  lead_name: string | null;
  host_name: string | null;
};

const ROLES = ["super_admin", "ops_manager", "team_lead", "agent"] as const;
const NOT_CONNECTED = "Zoom is not connected for this workspace. Ask an admin to connect it under Settings > Zoom.";

function friendly(e: unknown, hostEmail: string): string {
  if (e instanceof ZoomError) {
    if (e.code === "user_not_found") {
      return `${hostEmail} is not a user on your Zoom account. Add them in Zoom (or use the same email in Zoom and here) and try again.`;
    }
    return e.message;
  }
  return "Zoom request failed.";
}

const scheduleSchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  topic: z.string().trim().min(2, "Topic is required").max(200),
  start: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a valid start time"),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  agenda: z.string().trim().max(2000).optional().nullable(),
  timezone: z.string().trim().min(1).max(64).optional().nullable(),
});

type NewMeeting = z.infer<typeof scheduleSchema>;

async function bookMeeting(input: NewMeeting, instant: boolean): Promise<MeetingResult> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createRealClient();

  const creds = await getZoomCredentials(profile.workspace_id);
  if (!creds) return { error: NOT_CONNECTED };

  let campaignId: string | null = null;
  if (input.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, campaign_id")
      .eq("id", input.leadId)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();
    if (!lead) return { error: "Lead not found." };
    campaignId = lead.campaign_id;
  }

  const start = instant ? new Date() : new Date(input.start);
  if (!instant && start.getTime() < Date.now() - 5 * 60_000) return { error: "Start time is in the past." };
  const timezone = input.timezone || profile.timezone || "UTC";

  let zoom;
  try {
    zoom = await createMeeting(creds, {
      hostEmail: profile.email,
      topic: input.topic,
      startTime: instant ? null : start,
      durationMinutes: input.durationMinutes,
      timezone,
      agenda: input.agenda,
    });
  } catch (e) {
    return { error: friendly(e, profile.email) };
  }

  const { data: row, error } = await supabase
    .from("zoom_meetings")
    .insert({
      workspace_id: profile.workspace_id,
      lead_id: input.leadId ?? null,
      campaign_id: campaignId,
      host_id: profile.id,
      zoom_meeting_id: String(zoom.id),
      topic: input.topic,
      agenda: input.agenda || null,
      start_time: start.toISOString(),
      duration_minutes: input.durationMinutes,
      timezone,
      join_url: zoom.join_url,
      password: zoom.password ?? null,
      status: instant ? "started" : "scheduled",
      created_by: profile.id,
    })
    .select("id, join_url, password, start_time, topic")
    .single();
  if (error || !row) {
    // Do not leave an orphan meeting in Zoom.
    await deleteMeeting(creds, String(zoom.id)).catch(() => {});
    return { error: "Zoom created the meeting but it could not be saved. It was removed; try again." };
  }
  revalidatePath("/meetings");
  return {
    ok: true,
    meeting: { id: row.id, joinUrl: row.join_url, password: row.password, startTime: row.start_time, topic: row.topic },
  };
}

export async function scheduleMeeting(input: {
  leadId?: string | null;
  topic: string;
  start: string;
  durationMinutes: number;
  agenda?: string | null;
  timezone?: string | null;
}): Promise<MeetingResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  return bookMeeting(parsed.data, false);
}

export async function instantMeeting(input: {
  leadId?: string | null;
  topic: string;
  durationMinutes?: number;
  timezone?: string | null;
}): Promise<MeetingResult> {
  const parsed = scheduleSchema.safeParse({
    ...input,
    start: new Date().toISOString(),
    durationMinutes: input.durationMinutes ?? 30,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  return bookMeeting(parsed.data, true);
}

export async function cancelMeeting(meetingId: string): Promise<MeetingResult> {
  const profile = await requireRole([...ROLES]);
  if (!z.string().uuid().safeParse(meetingId).success) return { error: "Meeting not found." };
  const supabase = await createRealClient();
  const { data: m } = await supabase
    .from("zoom_meetings")
    .select("id, host_id, zoom_meeting_id, status")
    .eq("id", meetingId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!m) return { error: "Meeting not found." };
  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  if (m.host_id !== profile.id && !isManager) return { error: "Only the host or a manager can cancel a meeting." };
  if (m.status === "cancelled") return { ok: true };

  const creds = await getZoomCredentials(profile.workspace_id);
  if (!creds) return { error: NOT_CONNECTED };
  try {
    await deleteMeeting(creds, m.zoom_meeting_id);
  } catch (e) {
    return { error: friendly(e, profile.email) };
  }
  const { error } = await supabase.from("zoom_meetings").update({ status: "cancelled" }).eq("id", m.id);
  if (error) return { error: "Cancelled in Zoom but could not update the record." };
  revalidatePath("/meetings");
  return { ok: true };
}

// The host start_url is a bearer link and is never stored: fetch it fresh
// from Zoom each time the host clicks Start.
export async function getStartUrl(meetingId: string): Promise<{ error?: string; url?: string }> {
  const profile = await requireRole([...ROLES]);
  if (!z.string().uuid().safeParse(meetingId).success) return { error: "Meeting not found." };
  const supabase = await createRealClient();
  const { data: m } = await supabase
    .from("zoom_meetings")
    .select("id, host_id, zoom_meeting_id, status")
    .eq("id", meetingId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!m) return { error: "Meeting not found." };
  if (m.host_id !== profile.id) return { error: "Only the host can start this meeting." };
  if (m.status === "cancelled" || m.status === "ended") return { error: `This meeting is ${m.status}.` };

  const creds = await getZoomCredentials(profile.workspace_id);
  if (!creds) return { error: NOT_CONNECTED };
  try {
    const zm = await getMeeting(creds, m.zoom_meeting_id);
    if (!zm.start_url) return { error: "Zoom did not return a start link." };
    if (m.status === "scheduled") await supabase.from("zoom_meetings").update({ status: "started" }).eq("id", m.id);
    return { url: zm.start_url };
  } catch (e) {
    return { error: friendly(e, profile.email) };
  }
}

type JoinedRow = RealTables<"zoom_meetings"> & {
  leads: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
  host: { full_name: string | null } | null;
};

async function loadMeetings(onlyMine: boolean): Promise<MeetingRow[]> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createRealClient();
  let q = supabase
    .from("zoom_meetings")
    .select("*, leads(full_name, first_name, last_name), host:profiles!zoom_meetings_host_id_fkey(full_name)")
    .eq("workspace_id", profile.workspace_id)
    .order("start_time", { ascending: true })
    .limit(500);
  if (onlyMine) q = q.eq("host_id", profile.id);
  const { data } = await q;
  return ((data ?? []) as unknown as JoinedRow[]).map(({ leads, host, ...m }) => ({
    ...m,
    lead_name: leads ? [leads.first_name, leads.last_name].filter(Boolean).join(" ") || leads.full_name : null,
    host_name: host?.full_name ?? null,
  }));
}

export async function listMyMeetings(): Promise<MeetingRow[]> {
  return loadMeetings(true);
}

// Everything the caller's RLS scope allows: all for managers, the team for
// team leads, own/assigned-lead meetings for agents.
export async function listWorkspaceMeetings(): Promise<MeetingRow[]> {
  return loadMeetings(false);
}
