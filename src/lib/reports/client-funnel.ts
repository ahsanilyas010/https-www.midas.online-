import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ClientFunnelRow {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string;
  market: string | null;
  loaded: number;
  dialable: number;
  contacted: number;
  qualified: number;
  converted: number;
}

export interface ClientDispositionRow {
  campaign_id: string;
  campaign_name: string;
  campaign_code: string;
  disposition_code: string;
  disposition_label: string;
  category: string;
  attempts: number;
}

export interface ClientFunnelResult {
  clientName: string;
  isManager: boolean;
  rows: ClientFunnelRow[];
  dispositions: ClientDispositionRow[];
  clientId: string | null;
  fullVisibility: boolean;
}

export type ClientFunnelOutcome =
  | { ok: true; result: ClientFunnelResult }
  | { ok: false; status: number; error: string };

// Shared by the client dashboard page and its PDF export route — auth is
// re-checked here rather than trusted from the caller, since the PDF
// route is a separate entry point from the page. get_client_funnel() and
// get_client_dispositions() both self-scope a client_viewer server-side,
// so clientIdParam only ever takes effect for a manager previewing a
// specific client.
export async function loadClientFunnel(clientIdParam: string | null): Promise<ClientFunnelOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["client_viewer", "super_admin", "ops_manager"].includes(profile.role)) {
    return { ok: false, status: 403, error: "Not authorized." };
  }

  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  const targetClientId = isManager ? clientIdParam : null;

  const [{ data: rows, error }, { data: dispositions, error: dispositionsError }] = await Promise.all([
    supabase.rpc("get_client_funnel", { p_client_id: targetClientId ?? undefined }),
    supabase.rpc("get_client_dispositions", { p_client_id: targetClientId ?? undefined }),
  ]);
  if (error) return { ok: false, status: 500, error: error.message };
  if (dispositionsError) return { ok: false, status: 500, error: dispositionsError.message };

  let clientName = "All clients";
  let fullVisibility = false;
  const lookupId = isManager ? targetClientId : profile.client_id;
  if (lookupId) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, full_visibility")
      .eq("id", lookupId)
      .single();
    clientName = client?.name ?? "Unknown client";
    fullVisibility = client?.full_visibility ?? false;
  } else if (!isManager) {
    clientName = "No client linked to this account";
  }

  return {
    ok: true,
    result: {
      clientName,
      isManager,
      rows: (rows as ClientFunnelRow[]) ?? [],
      dispositions: (dispositions as ClientDispositionRow[]) ?? [],
      clientId: lookupId ?? null,
      fullVisibility,
    },
  };
}
