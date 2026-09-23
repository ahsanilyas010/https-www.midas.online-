import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ClientLeadRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_code: string;
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
  status: string;
  screening_status: string;
  do_not_call: boolean;
  assigned_agent_label: string | null;
  attempt_count: number;
  custom: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientCallLogRow {
  id: string;
  lead_id: string;
  campaign_id: string;
  campaign_code: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone_e164: string;
  agent_label: string | null;
  attempt_no: number;
  disposition_code: string | null;
  disposition_label: string | null;
  category: string | null;
  started_at: string;
  ended_at: string | null;
  talk_seconds: number | null;
  wrap_seconds: number | null;
  notes: string | null;
}

export interface ClientFollowupRow {
  id: string;
  lead_id: string;
  campaign_id: string;
  campaign_code: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone_e164: string;
  agent_label: string | null;
  followup_type: string;
  due_at: string;
  note: string | null;
  priority: string;
  status: string;
  snooze_count: number;
}

export type ClientFullVisibilityOutcome =
  | {
      ok: true;
      leads: ClientLeadRow[];
      callLog: ClientCallLogRow[];
      followups: ClientFollowupRow[];
    }
  | { ok: false; status: number; error: string };

// Only meaningful once loadClientFunnel's fullVisibility flag is true for
// the target client — these RPCs self-gate on clients.full_visibility for
// a client_viewer anyway (see migration 34), this loader just avoids the
// extra round trips for every client that hasn't opted in.
export async function loadClientFullVisibility(clientIdParam: string | null): Promise<ClientFullVisibilityOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["client_viewer", "super_admin", "ops_manager"].includes(profile.role)) {
    return { ok: false, status: 403, error: "Not authorized." };
  }

  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  const targetClientId = isManager ? clientIdParam : null;

  const [
    { data: leads, error: leadsError },
    { data: callLog, error: callLogError },
    { data: followups, error: followupsError },
  ] = await Promise.all([
    supabase.rpc("get_client_leads", { p_client_id: targetClientId ?? undefined }),
    supabase.rpc("get_client_call_log", { p_client_id: targetClientId ?? undefined }),
    supabase.rpc("get_client_followups", { p_client_id: targetClientId ?? undefined }),
  ]);
  if (leadsError) return { ok: false, status: 500, error: leadsError.message };
  if (callLogError) return { ok: false, status: 500, error: callLogError.message };
  if (followupsError) return { ok: false, status: 500, error: followupsError.message };

  return {
    ok: true,
    leads: (leads as ClientLeadRow[]) ?? [],
    callLog: (callLog as ClientCallLogRow[]) ?? [],
    followups: (followups as ClientFollowupRow[]) ?? [],
  };
}
