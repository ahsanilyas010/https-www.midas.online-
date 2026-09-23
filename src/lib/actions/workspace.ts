"use server";

import { createClient } from "@/lib/supabase/server";

export interface WorkspaceLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  job_title: string | null;
  phone_e164: string;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  screened_at: string | null;
  attempt_count: number;
  next_action_at: string | null;
  lead_local_time: string | null;
  custom: unknown;
}

export interface WorkspaceDisposition {
  id: string;
  code: string;
  label: string;
  sets_dnc: boolean;
  requires_note: boolean;
  requires_followup: boolean;
}

export interface QueueCounts {
  due_now: number;
  fresh: number;
  total: number;
}

export async function getAssignedCampaigns() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("campaign_assignments")
    .select(
      "campaigns(id, code, name, market, max_attempts, script_md, objection_handling_md, opening_disclosure)",
    )
    .eq("user_id", user.id);

  return (data ?? [])
    .map(
      (row) =>
        (
          row as unknown as {
            campaigns: {
              id: string;
              code: string;
              name: string;
              market: string;
              max_attempts: number;
              script_md: string | null;
              objection_handling_md: string | null;
              opening_disclosure: string | null;
            };
          }
        ).campaigns,
    )
    .filter(Boolean);
}

export async function getQueueCounts(campaignId: string): Promise<QueueCounts> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dialable_leads")
    .select("next_action_at")
    .eq("campaign_id", campaignId);

  const rows = data ?? [];
  const dueNow = rows.filter((r) => r.next_action_at !== null).length;
  return { due_now: dueNow, fresh: rows.length - dueNow, total: rows.length };
}

export async function getNextLead(campaignId: string): Promise<WorkspaceLead | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_dialable_leads")
    .select(
      "id, first_name, last_name, company_name, job_title, phone_e164, email, address_line1, city, region, postcode, screened_at, attempt_count, next_action_at, lead_local_time, custom",
    )
    .eq("campaign_id", campaignId)
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data as WorkspaceLead | null;
}

export async function getDispositions(campaignId: string): Promise<WorkspaceDisposition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dispositions")
    .select("id, code, label, sets_dnc, requires_note, requires_followup, campaign_id, sort_order")
    .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
    .order("sort_order");

  return (data ?? []) as WorkspaceDisposition[];
}

export interface SubmitCallResult {
  error?: string;
  ok?: boolean;
  suppressed?: boolean;
  /** Set when the call committed but a non-critical follow-on step failed. */
  warning?: string;
}

export async function submitCallAttempt(params: {
  leadId: string;
  campaignId: string;
  dispositionCode: string;
  notes: string;
  wrapSeconds: number;
  callbackAt: string | null;
}): Promise<SubmitCallResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("record_call_attempt", {
    p_lead_id: params.leadId,
    p_disposition_code: params.dispositionCode,
    p_notes: params.notes || undefined,
    p_wrap_seconds: params.wrapSeconds,
    p_next_action_at: params.callbackAt ?? undefined,
  });

  if (error) return { error: error.message };

  if (params.callbackAt) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error: followupError } = await supabase.from("followups").insert({
        lead_id: params.leadId,
        campaign_id: params.campaignId,
        assigned_to: user.id,
        created_by: user.id,
        followup_type: "callback",
        due_at: params.callbackAt,
        due_at_lead_local: params.callbackAt,
        note: params.notes || null,
      });

      // The call itself is already committed by record_call_attempt, and
      // the lead's next_action_at is set — so the callback isn't lost.
      // But the follow-up tray would never show it, so say so rather than
      // reporting a clean success the agent would take at face value.
      if (followupError) {
        return {
          ok: true,
          suppressed: params.dispositionCode === "connected_dnc",
          warning: `Call logged and callback time saved, but it won't appear in your follow-up tray: ${followupError.message}`,
        };
      }
    }
  }

  return { ok: true, suppressed: params.dispositionCode === "connected_dnc" };
}
