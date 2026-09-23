// Computed equivalents of the database views the app reads from.

import type { DemoStore, Row } from "./store";

export const VIEW_NAMES = new Set(["v_dialable_leads", "v_campaign_funnel", "v_source_performance"]);

const CLOSED = new Set(["converted", "rejected", "suppressed", "unreachable"]);

function localTime(tz: string | null) {
  try {
    return new Date().toLocaleTimeString("en-GB", { timeZone: tz ?? "UTC", hour12: false });
  } catch {
    return new Date().toISOString().slice(11, 19);
  }
}

// Mirrors migration 009's v_dialable_leads, except the calling-window /
// calling-day gate: a demo has to be dialable whatever time of day it is
// being shown, so that check is intentionally skipped here.
function dialable(store: DemoStore): Row[] {
  const now = Date.now();
  const campaigns = new Map(store.tables.campaigns.map((c) => [c.id, c]));
  const suppressed = new Set(store.tables.suppression_list.map((s) => s.phone_e164));
  return store.tables.leads
    .filter((l) => {
      const c = campaigns.get(l.campaign_id);
      if (!c || !c.is_active) return false;
      if (l.do_not_call || suppressed.has(l.phone_e164)) return false;
      if (l.screening_status !== "passed" || !l.screened_at) return false;
      if (new Date(l.screened_at as string).getTime() < now - (c.screening_max_age_days as number) * 86400_000) return false;
      if (CLOSED.has(l.status as string)) return false;
      if ((l.attempt_count as number) >= (c.max_attempts as number)) return false;
      if (l.last_attempt_at && new Date(l.last_attempt_at as string).getTime() > now - (c.min_hours_between_attempts as number) * 3600_000)
        return false;
      if (l.next_action_at && new Date(l.next_action_at as string).getTime() > now) return false;
      return true;
    })
    .map((l) => {
      const c = campaigns.get(l.campaign_id)!;
      return { ...l, campaign_code: c.code, market: c.market, lead_local_time: localTime(l.lead_timezone as string | null) };
    });
}

function funnel(store: DemoStore): Row[] {
  const by = new Map<unknown, Row>();
  for (const l of store.tables.leads) {
    let r = by.get(l.campaign_id);
    if (!r) {
      r = { campaign_id: l.campaign_id, loaded: 0, screened_passed: 0, dialable: 0, worked: 0, contacted: 0, qualified: 0, converted: 0 };
      by.set(l.campaign_id, r);
    }
    (r.loaded as number)++;
    if (l.screening_status === "passed") {
      (r.screened_passed as number)++;
      if (!l.do_not_call && !CLOSED.has(l.status as string)) (r.dialable as number)++;
    }
    if ((l.attempt_count as number) > 0) {
      (r.worked as number)++;
      (r.contacted as number)++;
    }
    if (l.status === "qualified") (r.qualified as number)++;
    if (l.status === "converted") (r.converted as number)++;
  }
  return [...by.values()];
}

function sourcePerformance(store: DemoStore): Row[] {
  const suppressed = new Set(store.tables.suppression_list.map((s) => s.phone_e164));
  return store.tables.data_sources.map((d) => {
    const leads = store.tables.leads.filter((l) => l.data_source_id === d.id);
    const runs = store.tables.source_fetch_runs.filter((r) => r.data_source_id === d.id);
    const last = runs.map((r) => r.started_at as string).sort().pop() ?? null;
    return {
      data_source_id: d.id,
      name: d.name,
      source_type: d.source_type,
      lawful_basis: d.lawful_basis,
      market: d.market,
      is_active: d.is_active,
      leads_loaded: leads.length,
      screened_passed: leads.filter((l) => l.screening_status === "passed").length,
      suppressed: leads.filter((l) => l.do_not_call || suppressed.has(l.phone_e164)).length,
      worked: leads.filter((l) => (l.attempt_count as number) > 0).length,
      contacted: leads.filter((l) => (l.attempt_count as number) > 0).length,
      qualified: leads.filter((l) => l.status === "qualified").length,
      converted: leads.filter((l) => l.status === "converted").length,
      fetch_run_count: runs.length,
      last_fetched_at: last,
    };
  });
}

export function computeView(name: string, store: DemoStore): Row[] {
  switch (name) {
    case "v_dialable_leads":
      return dialable(store);
    case "v_campaign_funnel":
      return funnel(store);
    case "v_source_performance":
      return sourcePerformance(store);
    default:
      return [];
  }
}
