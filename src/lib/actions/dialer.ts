"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createDialerAdapter, TELEPHONY_MODE } from "@/lib/telephony/adapters";
import { isProviderKey, providerMeta } from "@/lib/telephony/providers";
import type { DialerProviderKey, DialerSettings, ProviderHttpRequest } from "@/lib/telephony/types";
import type { Json, Tables } from "@/lib/supabase/types";

export interface DialerState {
  connected: boolean;
  provider: DialerProviderKey | null;
  accountName: string | null;
  plan: string | null;
  connectedAt: string | null;
  settings: DialerSettings;
  credentialsMasked: Record<string, string>;
  mode: "demo" | "live";
}

export interface RecentCall {
  id: string;
  provider: string;
  to_number: string;
  from_number: string;
  status: string;
  started_at: string;
  duration_seconds: number;
  recording_url: string | null;
  lead: { id: string; first_name: string | null; last_name: string | null; company_name: string | null } | null;
  agent: { full_name: string } | null;
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

const DEFAULT_SETTINGS: DialerSettings = {
  caller_id: "",
  numbers: [],
  dial_mode: "click_to_call",
  record_calls: true,
  local_presence: false,
  auto_log_calls: true,
  agent_extension: "",
};

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, role: profile?.role ?? null };
}

const isManager = (role: string | null) => role === "super_admin" || role === "ops_manager";

export async function getDialerState(): Promise<DialerState> {
  const supabase = await createClient();
  const { data } = await supabase.from("integrations").select("*").eq("id", "dialer").maybeSingle();
  const raw = (data?.settings as (Partial<DialerSettings> & { credentials_masked?: Record<string, string> }) | null) ?? {};
  const { credentials_masked, ...settings } = raw;
  const provider = data?.provider && isProviderKey(data.provider) ? data.provider : null;
  return {
    connected: Boolean(data?.connected && provider),
    provider,
    accountName: data?.account_name ?? null,
    plan: data?.plan ?? null,
    connectedAt: data?.connected_at ?? null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    credentialsMasked: credentials_masked ?? {},
    mode: TELEPHONY_MODE,
  };
}

function mask(v: string) {
  const t = v.trim();
  if (!t) return "";
  return `••••${t.slice(-4)}`;
}

// Connect (or switch to) a dialer provider. Only one is active at a time.
// Demo build: credentials are validated for presence and stored masked —
// the raw values are never kept. A live build would encrypt and store them
// server-side and run an OAuth / test call here.
export async function connectDialer(providerKey: string, credentials: Record<string, string>): Promise<ActionResult> {
  const { supabase, user, role } = await caller();
  if (!user) return { error: "Not signed in." };
  if (!isManager(role)) return { error: "Only admins can change the dialer integration." };
  const meta = providerMeta(providerKey);
  if (!meta) return { error: "Unknown dialer provider." };

  if (meta.auth === "api_key") {
    const missing = meta.credentialFields.filter((f) => !credentials[f.key]?.trim()).map((f) => f.label);
    if (missing.length) return { error: `Missing: ${missing.join(", ")}` };
  }

  const current = await getDialerState();
  const numbers = current.settings.numbers.length ? current.settings.numbers : ["+442038076512", "+441615550199", "+15125550143"];
  const masked = Object.fromEntries(
    meta.credentialFields.map((f) => [f.key, credentials[f.key] ? mask(credentials[f.key]) : meta.auth === "oauth" ? "authorised via OAuth" : ""]),
  );

  const { error } = await supabase.from("integrations").upsert({
    id: "dialer",
    provider: meta.key,
    connected: true,
    account_email: "calls@dialdesk.demo",
    account_name: "DialDesk Contact Centre",
    plan: `${meta.name} (demo account)`,
    connected_at: new Date().toISOString(),
    connected_by: user.id,
    settings: { ...current.settings, numbers, caller_id: current.settings.caller_id || numbers[0], credentials_masked: masked } as unknown as Json,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function disconnectDialer(): Promise<ActionResult> {
  const { supabase, user, role } = await caller();
  if (!user) return { error: "Not signed in." };
  if (!isManager(role)) return { error: "Only admins can change the dialer integration." };
  const { error } = await supabase.from("integrations").update({ connected: false }).eq("id", "dialer");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateDialerSettings(settings: DialerSettings): Promise<ActionResult> {
  const { supabase, user, role } = await caller();
  if (!user) return { error: "Not signed in." };
  if (!isManager(role)) return { error: "Only admins can change the dialer integration." };
  const current = await getDialerState();
  const { error } = await supabase
    .from("integrations")
    .update({ settings: { ...settings, credentials_masked: current.credentialsMasked } as unknown as Json })
    .eq("id", "dialer");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// A sample outbound request for the Integrations page's API preview.
export async function previewDialerRequest(providerKey: string): Promise<ProviderHttpRequest | null> {
  if (!isProviderKey(providerKey)) return null;
  const state = await getDialerState();
  return createDialerAdapter(providerKey).buildOutboundCall({
    to: "+447700900123",
    from: state.settings.caller_id || "+442038076512",
    record: state.settings.record_calls,
    metadata: { lead_id: "lead_123", campaign: "NWR-UK" },
  });
}

export interface StartCallResult extends ActionResult {
  callId?: string;
  provider?: DialerProviderKey;
  providerName?: string;
  from?: string;
  request?: ProviderHttpRequest;
}

// Place an outbound call through whichever dialer the client subscribes to.
export async function startCall(params: { to: string; leadId?: string | null }): Promise<StartCallResult> {
  const { supabase, user } = await caller();
  if (!user) return { error: "Not signed in." };
  const state = await getDialerState();
  if (!state.connected || !state.provider) return { error: "No dialer connected. An admin can connect one under Integrations." };

  const to = params.to.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(to)) return { error: "Enter a valid phone number." };
  const e164 = to.startsWith("+") ? to : `+${to}`;

  let campaignId: string | null = null;
  if (params.leadId) {
    const { data: lead } = await supabase.from("leads").select("campaign_id, do_not_call").eq("id", params.leadId).maybeSingle();
    if (lead?.do_not_call) return { error: "This lead is marked do-not-call." };
    campaignId = lead?.campaign_id ?? null;
  }
  const { data: suppressed } = await supabase.from("suppression_list").select("phone_e164").eq("phone_e164", e164).maybeSingle();
  if (suppressed) return { error: "This number is on the suppression list — calling is blocked." };

  // Local presence: prefer a caller ID from the same country as the lead.
  const sameCountry = state.settings.local_presence
    ? state.settings.numbers.find((n) => n.slice(0, 3) === e164.slice(0, 3))
    : undefined;
  const from = sameCountry ?? state.settings.caller_id ?? state.settings.numbers[0];

  const adapter = createDialerAdapter(state.provider);
  let placed;
  try {
    placed = await adapter.placeCall({
      to: e164,
      from,
      agentExtension: state.settings.agent_extension || undefined,
      record: state.settings.record_calls,
      metadata: { lead_id: params.leadId ?? "", agent_id: user.id },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The dialer rejected the call." };
  }

  const { data: row, error } = await supabase
    .from("dialer_calls")
    .insert({
      provider: state.provider,
      provider_call_id: placed.providerCallId,
      from_number: from,
      to_number: e164,
      lead_id: params.leadId ?? null,
      campaign_id: campaignId,
      agent_id: user.id,
      status: "ringing",
    })
    .select("id")
    .single();
  if (error || !row) return { error: error?.message ?? "Couldn't log the call." };

  return {
    ok: true,
    callId: row.id,
    provider: state.provider,
    providerName: providerMeta(state.provider)?.name,
    from,
    request: placed.request,
  };
}

export async function updateCall(callId: string, status: "connected" | "completed" | "missed"): Promise<ActionResult> {
  const { supabase, user } = await caller();
  if (!user) return { error: "Not signed in." };
  const { data: call } = await supabase.from("dialer_calls").select("*").eq("id", callId).maybeSingle();
  if (!call) return { error: "Call not found." };
  const now = new Date().toISOString();
  const patch: Partial<Tables<"dialer_calls">> = { status };
  if (status === "connected") patch.answered_at = now;
  if (status === "completed" || status === "missed") {
    patch.ended_at = now;
    const answered = call.answered_at ? new Date(call.answered_at).getTime() : null;
    patch.duration_seconds = answered ? Math.round((Date.now() - answered) / 1000) : 0;
    const state = await getDialerState();
    if (answered && state.settings.record_calls) patch.recording_url = `https://recordings.dialdesk.demo/${call.provider_call_id}`;
    if (!answered) patch.status = "missed";
  }
  const { error } = await supabase.from("dialer_calls").update(patch).eq("id", callId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function listRecentCalls(limit = 25): Promise<RecentCall[]> {
  const { supabase, user, role } = await caller();
  if (!user) return [];
  let q = supabase
    .from("dialer_calls")
    .select(
      "id, provider, to_number, from_number, status, started_at, duration_seconds, recording_url, lead:leads(id, first_name, last_name, company_name), agent:profiles!dialer_calls_agent_id_fkey(full_name)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (!isManager(role) && role !== "team_lead" && role !== "qa") q = q.eq("agent_id", user.id);
  const { data } = await q;
  return (data ?? []) as unknown as RecentCall[];
}
