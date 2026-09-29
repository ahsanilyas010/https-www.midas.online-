"use server";

import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { RealTables } from "@/lib/supabase/real-types";

type EventType = RealTables<"attendance_events">["event_type"];

async function logEvent(eventType: EventType): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("attendance_events")
    .insert({ workspace_id: profile.workspace_id, user_id: profile.id, event_type: eventType });
  if (error) return { error: error.message };
  revalidatePath("/live", "page");
  return {};
}

export async function clockIn() {
  return logEvent("clock_in");
}
export async function clockOut() {
  return logEvent("clock_out");
}
export async function startBreak() {
  return logEvent("break_start");
}
export async function endBreak() {
  return logEvent("break_end");
}

export async function getMyLatestEvent(): Promise<EventType | null> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data } = await supabase
    .from("attendance_events")
    .select("event_type")
    .eq("workspace_id", profile.workspace_id)
    .eq("user_id", profile.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.event_type ?? null;
}

export interface LeaveActionState {
  error?: string;
  ok?: boolean;
}

export async function requestLeave(_prev: LeaveActionState, formData: FormData): Promise<LeaveActionState> {
  const profile = await requireRealProfile();
  const fromDate = String(formData.get("from_date") ?? "");
  const toDate = String(formData.get("to_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!fromDate || !toDate) return { error: "Choose both dates." };

  const supabase = await createRealClient();
  const { error } = await supabase.from("leave_requests").insert({
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    from_date: fromDate,
    to_date: toDate,
    reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/live", "page");
  return { ok: true };
}

export async function reviewLeaveRequest(id: string, approve: boolean): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can review leave requests." };
  }
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: approve ? "approved" : "rejected", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/live", "page");
  return {};
}
