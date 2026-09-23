"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export interface FollowupRow {
  id: string;
  lead_id: string;
  followup_type: string;
  due_at: string;
  note: string | null;
  priority: string;
  status: string;
  snooze_count: number;
  leads: { first_name: string | null; last_name: string | null; phone_e164: string } | null;
}

export async function getMyFollowups(): Promise<FollowupRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("followups")
    .select("id, lead_id, followup_type, due_at, note, priority, status, snooze_count, leads(first_name, last_name, phone_e164)")
    .eq("assigned_to", user.id)
    .in("status", ["pending", "snoozed"])
    .order("due_at", { ascending: true })
    .limit(20);

  return (data ?? []) as unknown as FollowupRow[];
}

export async function snoozeFollowup(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("snooze_followup", { p_followup_id: id });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeFollowup(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("followups")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelFollowup(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("followups").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
