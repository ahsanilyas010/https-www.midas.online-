"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom/api";
import type { Json, Tables } from "@/lib/supabase/types";

export type ZoomMeetingRow = Tables<"zoom_meetings"> & {
  host: { full_name: string; agent_code: string | null } | null;
  lead: { first_name: string | null; last_name: string | null; company_name: string | null; phone_e164: string } | null;
  campaign: { code: string; name: string } | null;
};

export interface ZoomSettings {
  auto_recording: "cloud" | "local" | "none";
  waiting_room: boolean;
  ai_companion: boolean;
  add_to_followups: boolean;
}

export interface ZoomIntegration {
  connected: boolean;
  accountEmail: string | null;
  accountName: string | null;
  plan: string | null;
  connectedAt: string | null;
  settings: ZoomSettings;
}

const DEFAULT_SETTINGS: ZoomSettings = {
  auto_recording: "cloud",
  waiting_room: true,
  ai_companion: true,
  add_to_followups: true,
};

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, role: profile?.role ?? null };
}

export async function getZoomIntegration(): Promise<ZoomIntegration> {
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("*").eq("id", "zoom").maybeSingle();
  return {
    connected: data?.connected ?? false,
    accountEmail: data?.account_email ?? null,
    accountName: data?.account_name ?? null,
    plan: data?.plan ?? null,
    connectedAt: data?.connected_at ?? null,
    settings: { ...DEFAULT_SETTINGS, ...((data?.settings as Partial<ZoomSettings> | null) ?? {}) },
  };
}

const MEETING_SELECT =
  "*, host:profiles!zoom_meetings_host_id_fkey(full_name, agent_code), lead:leads(first_name, last_name, company_name, phone_e164), campaign:campaigns(code, name)";

export async function listZoomMeetings(opts: { mine?: boolean } = {}): Promise<ZoomMeetingRow[]> {
  const { supabase, user, role } = await currentUser();
  if (!user) return [];
  let query = supabase.from("zoom_meetings").select(MEETING_SELECT).order("start_time", { ascending: true });
  // Agents only ever see meetings they host.
  if (opts.mine || role === "agent") query = query.eq("host_id", user.id);
  const { data } = await query;
  return (data ?? []) as unknown as ZoomMeetingRow[];
}

export async function listLeadMeetings(leadId: string): Promise<ZoomMeetingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zoom_meetings")
    .select(MEETING_SELECT)
    .eq("lead_id", leadId)
    .order("start_time", { ascending: false });
  return (data ?? []) as unknown as ZoomMeetingRow[];
}

export interface ScheduleResult extends ActionResult {
  meeting?: { id: string; joinUrl: string; startUrl: string; topic: string; startTime: string; password: string | null; source: string; inviteeName: string | null; durationMinutes: number };
}

export async function scheduleZoomMeeting(_prev: ScheduleResult, formData: FormData): Promise<ScheduleResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not signed in." };

  const integration = await getZoomIntegration();
  if (!integration.connected) return { error: "Zoom isn't connected. An admin can connect it under Integrations." };

  const topic = String(formData.get("topic") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const instant = formData.get("instant") === "1";
  const duration = Math.min(Math.max(Number(formData.get("duration") ?? 30) || 30, 5), 240);
  const timezone = String(formData.get("timezone") ?? "Europe/London");
  const agenda = String(formData.get("agenda") ?? "").trim() || null;
  const leadId = String(formData.get("lead_id") ?? "") || null;
  const inviteeName = String(formData.get("invitee_name") ?? "").trim() || null;
  const inviteeEmail = String(formData.get("invitee_email") ?? "").trim() || null;
  const addFollowup = formData.get("add_followup") === "on";

  if (!topic) return { error: "Give the meeting a topic." };
  if (!instant && (!date || !time)) return { error: "Pick a date and time." };
  if (inviteeEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteeEmail)) return { error: "That invitee email doesn't look right." };

  // The date/time inputs are the browser's local wall-clock time; the form
  // also posts the browser's UTC offset so the server can build the instant.
  const offsetMinutes = Number(formData.get("tz_offset") ?? 0);
  const startMs = instant
    ? Date.now()
    : Date.parse(`${date}T${time}:00Z`) + offsetMinutes * 60_000;
  if (Number.isNaN(startMs)) return { error: "Invalid date or time." };
  if (!instant && startMs < Date.now() - 5 * 60_000) return { error: "That time is in the past." };
  const startTime = new Date(startMs).toISOString();

  let campaignId: string | null = null;
  if (leadId) {
    const { data: lead } = await supabase.from("leads").select("campaign_id").eq("id", leadId).maybeSingle();
    campaignId = lead?.campaign_id ?? null;
  }

  let created;
  try {
    created = await createZoomMeeting({
      topic,
      startTime,
      durationMinutes: duration,
      timezone,
      agenda: agenda ?? undefined,
      inviteeEmail,
      autoRecording: integration.settings.auto_recording,
      waitingRoom: integration.settings.waiting_room,
      instant,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Zoom rejected the request." };
  }

  const { data: row, error } = await supabase
    .from("zoom_meetings")
    .insert({
      zoom_meeting_id: created.zoomMeetingId,
      topic,
      agenda,
      start_time: startTime,
      duration_minutes: duration,
      timezone,
      join_url: created.joinUrl,
      start_url: created.startUrl,
      password: created.password,
      host_id: user.id,
      lead_id: leadId,
      campaign_id: campaignId,
      invitee_name: inviteeName,
      invitee_email: inviteeEmail,
      status: instant ? "started" : "scheduled",
      source: created.source,
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Couldn't save the meeting." };

  if (leadId && campaignId && addFollowup && integration.settings.add_to_followups && !instant) {
    await supabase.from("followups").insert({
      lead_id: leadId,
      campaign_id: campaignId,
      assigned_to: user.id,
      created_by: user.id,
      followup_type: "zoom_meeting",
      due_at: startTime,
      due_at_lead_local: startTime,
      note: `Zoom: ${topic}`,
      priority: "high",
    });
  }

  revalidatePath("/meetings");
  return {
    ok: true,
    meeting: { id: row.id, joinUrl: created.joinUrl, startUrl: created.startUrl, topic, startTime, password: created.password, source: created.source, inviteeName, durationMinutes: duration },
  };
}

export async function setMeetingStatus(id: string, status: "started" | "ended" | "cancelled"): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not signed in." };
  const { data: meeting } = await supabase.from("zoom_meetings").select("*").eq("id", id).maybeSingle();
  if (!meeting) return { error: "Meeting not found." };

  const patch: Partial<Tables<"zoom_meetings">> = { status };
  if (status === "cancelled") {
    try {
      await deleteZoomMeeting(meeting.zoom_meeting_id, meeting.source);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Zoom rejected the cancellation." };
    }
  }
  if (status === "ended") {
    const integration = await getZoomIntegration();
    const actual = Math.max(1, Math.round((Date.now() - new Date(meeting.start_time).getTime()) / 60_000));
    patch.actual_duration_minutes = Math.min(actual, meeting.duration_minutes * 2);
    patch.participants = meeting.participants ?? 2;
    if (meeting.source === "demo") {
      if (integration.settings.auto_recording === "cloud") patch.recording_url = `https://zoom.us/rec/share/demo-${meeting.zoom_meeting_id}`;
      if (integration.settings.ai_companion)
        patch.ai_summary = `Meeting with ${meeting.invitee_name ?? "the prospect"} covered: ${meeting.agenda ?? meeting.topic}. Prospect engaged well; next step agreed and logged as a follow-up.`;
    }
  }
  const { error } = await supabase.from("zoom_meetings").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/meetings");
  return { ok: true };
}

export async function setZoomConnection(connected: boolean): Promise<ActionResult> {
  const { supabase, user, role } = await currentUser();
  if (!user) return { error: "Not signed in." };
  if (role !== "super_admin" && role !== "ops_manager") return { error: "Only admins can change integrations." };
  const { error } = await supabase
    .from("integrations")
    .upsert({
      id: "zoom",
      provider: "zoom",
      connected,
      account_email: connected ? "calls@dialdesk.demo" : null,
      account_name: connected ? "DialDesk Contact Centre" : null,
      plan: connected ? "Zoom Workplace Business" : null,
      connected_at: connected ? new Date().toISOString() : null,
      connected_by: connected ? user.id : null,
    });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateZoomSettings(settings: ZoomSettings): Promise<ActionResult> {
  const { supabase, user, role } = await currentUser();
  if (!user) return { error: "Not signed in." };
  if (role !== "super_admin" && role !== "ops_manager") return { error: "Only admins can change integrations." };
  const { error } = await supabase
    .from("integrations")
    .update({ settings: settings as unknown as Json })
    .eq("id", "zoom");
  if (error) return { error: error.message };
  revalidatePath("/admin/integrations");
  return { ok: true };
}
