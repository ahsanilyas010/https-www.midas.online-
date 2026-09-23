"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

async function callerIp() {
  const hdrs = await headers();
  return hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function clockIn(): Promise<ActionResult> {
  const supabase = await createClient();
  const ip = await callerIp();
  const { error } = await supabase.rpc("clock_in", {
    p_ip: ip ?? undefined,
    p_device: "web",
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clockOut(): Promise<ActionResult> {
  const supabase = await createClient();
  const ip = await callerIp();
  const { error } = await supabase.rpc("clock_out", { p_ip: ip ?? undefined });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAuxState(
  state: Enums<"aux_state">,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_aux_state", {
    p_state: state,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface CurrentSession {
  id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: string | null;
  late_minutes: number;
  currentAux: Enums<"aux_state"> | null;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("id, work_date, clock_in_at, clock_out_at, status, late_minutes")
    .eq("user_id", user.id)
    .is("clock_out_at", null)
    .not("clock_in_at", "is", null)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return null;

  const { data: aux } = await supabase
    .from("aux_logs")
    .select("state")
    .eq("session_id", session.id)
    .is("ended_at", null)
    .maybeSingle();

  return { ...session, currentAux: aux?.state ?? null };
}

export type LeaveRequestResult = ActionResult;

export async function submitLeaveRequest(
  _prev: LeaveRequestResult,
  formData: FormData,
): Promise<LeaveRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const leaveType = String(formData.get("leave_type") ?? "annual");
  const fromDate = String(formData.get("from_date") ?? "");
  const toDate = String(formData.get("to_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const isHalfDay = formData.get("is_half_day") === "on";

  if (!fromDate || !toDate) return { error: "Pick a date range." };

  const { error } = await supabase.from("leave_requests").insert({
    user_id: user.id,
    leave_type: leaveType,
    from_date: fromDate,
    to_date: toDate,
    is_half_day: isHalfDay,
    reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function decideLeaveRequest(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export type CreateShiftResult = ActionResult;

export async function createShift(
  _prev: CreateShiftResult,
  formData: FormData,
): Promise<CreateShiftResult> {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const timezone = String(formData.get("timezone") ?? "Asia/Karachi");
  const graceMinutes = Number(formData.get("grace_minutes") ?? 10);

  if (!name || !startTime || !endTime) {
    return { error: "Name, start time and end time are required." };
  }

  const { error } = await supabase.from("shifts").insert({
    name,
    start_time: startTime,
    end_time: endTime,
    timezone,
    grace_minutes: graceMinutes,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}

export async function assignShift(
  userId: string,
  shiftId: string,
  effectiveFrom: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_assignments").insert({
    user_id: userId,
    shift_id: shiftId,
    effective_from: effectiveFrom,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/attendance");
  return { ok: true };
}
