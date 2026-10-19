"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const MANAGERS = ["super_admin", "ops_manager"] as const;
type Manager = (typeof MANAGERS)[number];

async function requireManager() {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role as Manager)) return null;
  return profile;
}

const shiftSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Start time is required."),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "End time is required."),
  timezone: z.string().trim().min(1).max(64),
  grace_minutes: z.coerce.number().int().min(0).max(240),
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day."),
});

export async function createShift(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can manage shifts." };

  const parsed = shiftSchema.safeParse({
    name: formData.get("name"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    timezone: formData.get("timezone") || "UTC",
    grace_minutes: formData.get("grace_minutes") || 10,
    days: formData.getAll("days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid shift." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return { error: `"${parsed.data.timezone}" is not a valid IANA timezone.` };
  }

  const supabase = await createRealClient();
  const { error } = await supabase.from("shifts").insert({
    workspace_id: profile.workspace_id,
    name: parsed.data.name,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    timezone: parsed.data.timezone,
    grace_minutes: parsed.data.grace_minutes,
    days_of_week: parsed.data.days,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function deleteShift(shiftId: string): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can manage shifts." };
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("id", shiftId)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function assignShift(userId: string, shiftId: string, effectiveFrom: string): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can assign shifts." };
  if (!z.string().uuid().safeParse(userId).success || !z.string().uuid().safeParse(shiftId).success) {
    return { error: "Pick an agent and a shift." };
  }
  const supabase = await createRealClient();

  // Both must live in the caller's workspace (RLS also enforces this on the
  // reads; the explicit check keeps the error message honest).
  const [{ data: shift }, { data: person }] = await Promise.all([
    supabase.from("shifts").select("id").eq("id", shiftId).eq("workspace_id", profile.workspace_id).maybeSingle(),
    supabase.from("profiles").select("id").eq("id", userId).eq("workspace_id", profile.workspace_id).maybeSingle(),
  ]);
  if (!shift || !person) return { error: "Shift or person not found in this workspace." };

  const { error } = await supabase.from("shift_assignments").upsert(
    {
      workspace_id: profile.workspace_id,
      user_id: userId,
      shift_id: shiftId,
      effective_from: effectiveFrom || new Date().toISOString().slice(0, 10),
      effective_to: null,
    },
    { onConflict: "workspace_id,user_id,shift_id" },
  );
  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function unassignShift(assignmentId: string): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can assign shifts." };
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function decideLeave(leaveId: string, approve: boolean): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can review leave requests." };
  const supabase = await createRealClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      status: approve ? "approved" : "rejected",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", leaveId)
    .eq("workspace_id", profile.workspace_id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That request is no longer pending." };
  revalidatePath("/admin/attendance");
  revalidatePath("/live", "page");
  return { ok: true };
}

// Campaign roster: who is on a campaign (campaign_assignments), the table
// next_lead_for_agent reads to decide which campaigns an agent can pull from.
export async function setCampaignRoster(campaignId: string, userId: string, on: boolean): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can change campaign rosters." };
  const supabase = await createRealClient();

  if (on) {
    const [{ data: camp }, { data: person }] = await Promise.all([
      supabase.from("campaigns").select("id").eq("id", campaignId).eq("workspace_id", profile.workspace_id).maybeSingle(),
      supabase.from("profiles").select("id").eq("id", userId).eq("workspace_id", profile.workspace_id).maybeSingle(),
    ]);
    if (!camp || !person) return { error: "Campaign or person not found in this workspace." };
    const { error } = await supabase
      .from("campaign_assignments")
      .upsert(
        { workspace_id: profile.workspace_id, campaign_id: campaignId, user_id: userId },
        { onConflict: "campaign_id,user_id", ignoreDuplicates: true },
      );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("campaign_assignments")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .eq("workspace_id", profile.workspace_id);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}
