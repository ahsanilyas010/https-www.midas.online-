// A light approximation of the database's row-level security policies, so
// an agent only sees their own leads and a client login only sees its own
// campaigns — the same experience the real app gives each role.

import type { DemoStore, Row } from "./store";

export interface DemoAuthContext {
  userId: string | null;
  role: string | null;
  clientId: string | null;
  /** Service-role (admin) clients bypass RLS entirely, as in Supabase. */
  bypass?: boolean;
  /** The data this client reads and writes: a customer workspace's store,
   *  or the shared demo store when absent. */
  store?: DemoStore;
}

function clientCampaignIds(store: DemoStore, clientId: string | null) {
  return new Set(store.tables.campaigns.filter((c) => c.client_id === clientId).map((c) => c.id));
}

export function applyRls(table: string, rows: Row[], auth: DemoAuthContext, store: DemoStore): Row[] {
  if (auth.bypass || !auth.role) return rows;

  if (auth.role === "agent") {
    switch (table) {
      case "leads":
      case "v_dialable_leads":
      case "unphoned_contacts":
        return rows.filter((r) => r.assigned_to === auth.userId);
      case "followups":
        return rows.filter((r) => r.assigned_to === auth.userId);
      case "call_attempts":
      case "email_sends":
      case "dialer_calls":
        return rows.filter((r) => r.agent_id === auth.userId);
      default:
        return rows;
    }
  }

  if (auth.role === "client_viewer") {
    const ids = clientCampaignIds(store, auth.clientId);
    switch (table) {
      case "clients":
        return rows.filter((r) => r.id === auth.clientId);
      case "campaigns":
        return rows.filter((r) => r.client_id === auth.clientId);
      case "leads":
      case "call_attempts":
      case "followups":
      case "zoom_meetings":
        return rows.filter((r) => ids.has(r.campaign_id));
      default:
        return rows;
    }
  }

  return rows;
}
