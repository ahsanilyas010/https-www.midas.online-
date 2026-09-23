import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ClientAgentActivityRow {
  day: string;
  agents_active: number;
  calls_attempted: number;
  connects: number;
  talk_minutes: number;
  wrap_minutes: number;
  attendance_minutes: number;
  productive_minutes: number;
}

export type ClientAgentActivityOutcome =
  | { ok: true; rows: ClientAgentActivityRow[] }
  | { ok: false; status: number; error: string };

// Companion to loadClientFunnel (same auth shape — client_viewer self-scopes
// server-side inside get_client_agent_activity, targetClientId only ever
// takes effect for a manager). Kept as a separate loader since the client
// page fetches this and the funnel/dispositions data in parallel for
// different sections of the page.
export async function loadClientAgentActivity(
  clientIdParam: string | null,
  days: number,
): Promise<ClientAgentActivityOutcome> {
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

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("get_client_agent_activity", {
    p_client_id: targetClientId ?? undefined,
    p_from: from,
    p_to: to,
  });
  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, rows: (data as ClientAgentActivityRow[]) ?? [] };
}
