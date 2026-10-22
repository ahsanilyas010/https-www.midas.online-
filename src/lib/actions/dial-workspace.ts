"use server";

import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { RealTables } from "@/lib/supabase/real-types";
import { diagnoseQueue, type QueueDiagnosisRow, type QueueReason } from "@/lib/dial/queue-diagnosis";

const STAFF_ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "qa_analyst"];

export interface DialWorkspaceLead {
  lead: RealTables<"leads">;
  campaign: RealTables<"campaigns"> | null;
}

export interface PullResult {
  error?: string;
  lead?: DialWorkspaceLead | null;
}

async function requireStaff() {
  const profile = await requireRealProfile();
  if (!STAFF_ROLES.includes(profile.role)) throw new Error("Only staff can use the dial workspace.");
  return profile;
}

// The Call button's only path to a phone number (spec) — next_lead_for_agent()
// (supabase/migrations/00000000000050) is the actual gate; this just calls
// it and hydrates the campaign alongside for the script/objection panel.
export async function pullNextLead(): Promise<PullResult> {
  const profile = await requireStaff();
  const supabase = await createRealClient();

  const { data: lead, error } = await supabase.rpc("next_lead_for_agent", { p_agent_id: profile.id });
  if (error) return { error: error.message };
  // The RPC returns an all-null composite row (not null) when nothing is eligible.
  if (!lead?.id) return { lead: null };

  const { data: campaign } = lead.campaign_id
    ? await supabase.from("campaigns").select("*").eq("id", lead.campaign_id).maybeSingle()
    : { data: null };

  return { lead: { lead, campaign: campaign ?? null } };
}

export async function listDispositions(): Promise<RealTables<"dispositions">[]> {
  const supabase = await createRealClient();
  const { data } = await supabase.from("dispositions").select("*").order("sort");
  return data ?? [];
}

export interface SubmitDispositionInput {
  leadId: string;
  dispositionCode: string;
  notes?: string;
  callbackDueAt?: string;
}

export async function submitDisposition(input: SubmitDispositionInput): Promise<{ error?: string }> {
  await requireStaff();
  const supabase = await createRealClient();
  const { error } = await supabase.rpc("record_call_attempt", {
    p_lead_id: input.leadId,
    p_disposition_code: input.dispositionCode,
    p_notes: input.notes ?? undefined,
    p_callback_due_at: input.callbackDueAt ?? undefined,
  });
  if (error) return { error: error.message };
  return {};
}

// Follow-up tray: due-now callbacks for the signed-in agent. Due-now
// callbacks are also queue 1 of next_lead_for_agent() itself — this is
// just for the tray's badge/list, not a second gate.
export async function getDueCallbacks(): Promise<RealTables<"callbacks">[]> {
  const profile = await requireStaff();
  const supabase = await createRealClient();
  const { data } = await supabase
    .from("callbacks")
    .select("*")
    .eq("agent_id", profile.id)
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .order("due_at");
  return data ?? [];
}

const SNOOZE_LIMIT = 3;
const SNOOZE_MINUTES = 15;

// Spec: "Callbacks pop up when due with a snooze limit of 3, then escalate
// to the team lead." Plain RLS-gated updates (callbacks_update in
// migration 00000000000049 already lets an agent update their own row) —
// no SECURITY DEFINER function needed since there's nothing
// compliance-sensitive here.
export async function snoozeCallback(callbackId: string): Promise<{ error?: string; escalated?: boolean }> {
  const profile = await requireStaff();
  const supabase = await createRealClient();

  const { data: cb } = await supabase.from("callbacks").select("*").eq("id", callbackId).eq("agent_id", profile.id).maybeSingle();
  if (!cb) return { error: "Callback not found." };

  if (cb.snooze_count + 1 >= SNOOZE_LIMIT) {
    const { error } = await supabase.from("callbacks").update({ status: "escalated", snooze_count: cb.snooze_count + 1 }).eq("id", callbackId);
    if (error) return { error: error.message };
    return { escalated: true };
  }

  const dueAt = new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString();
  const { error } = await supabase.from("callbacks").update({ due_at: dueAt, snooze_count: cb.snooze_count + 1 }).eq("id", callbackId);
  if (error) return { error: error.message };
  return {};
}

// Why the queue is empty, in one sentence a person can act on (migration 110).
export async function getQueueReason(): Promise<{ reason?: QueueReason; error?: string }> {
  await requireStaff();
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("dial_queue_diagnosis");
  if (error) return { error: error.message };
  const row = data?.[0];
  if (!row) return {};
  return { reason: diagnoseQueue(row as unknown as QueueDiagnosisRow) };
}
