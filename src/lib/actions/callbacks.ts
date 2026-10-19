"use server";

import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export interface CallbackRow {
  id: string;
  lead_id: string;
  due_at: string;
  status: string;
  snooze_count: number;
  leads: { full_name: string | null; phone_e164: string | null } | null;
}

const MAX_SNOOZES = 2;
const SNOOZE_MINUTES = 30;

// The follow-up tray: the signed-in agent's own pending callbacks, soonest
// first. Callbacks are created by record_call_attempt() when a disposition
// requires a follow-up, and are queue 1 of next_lead_for_agent().
export async function getMyCallbacks(): Promise<CallbackRow[]> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data } = await supabase
    .from("callbacks")
    .select("id, lead_id, due_at, status, snooze_count, leads(full_name, phone_e164)")
    .eq("workspace_id", profile.workspace_id)
    .eq("agent_id", profile.id)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(20);
  return (data ?? []) as unknown as CallbackRow[];
}

export async function snoozeCallback(id: string): Promise<ActionResult> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data: cb } = await supabase
    .from("callbacks")
    .select("snooze_count, due_at")
    .eq("id", id)
    .eq("agent_id", profile.id)
    .maybeSingle();
  if (!cb) return { error: "Callback not found." };
  if (cb.snooze_count >= MAX_SNOOZES) return { error: `A callback can only be snoozed ${MAX_SNOOZES} times.` };

  const base = Math.max(Date.now(), new Date(cb.due_at).getTime());
  const { error } = await supabase
    .from("callbacks")
    .update({ due_at: new Date(base + SNOOZE_MINUTES * 60_000).toISOString(), snooze_count: cb.snooze_count + 1 })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeCallback(id: string): Promise<ActionResult> {
  const supabase = await createRealClient();
  const { error } = await supabase.from("callbacks").update({ status: "done" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelCallback(id: string): Promise<ActionResult> {
  const supabase = await createRealClient();
  const { error } = await supabase.from("callbacks").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
