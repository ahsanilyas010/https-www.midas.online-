import "server-only";
import type { DataSourceConnector, NormalisedLead, RawRecord } from "./types";
import { politeFetch } from "./polite-fetch";

// Section 6.4 — "UK planning applications | Council open data / aggregator
// | Live planning applications tell you who is building right now. Most
// councils publish; coverage is patchy so consider an aggregator." PlanIt
// (planit.org.uk) aggregates planning-register data across most UK local
// authorities behind one JSON API, avoiding a per-council integration.
//
// NOTE: this environment's outbound network policy blocks arbitrary hosts
// (confirmed via the agent proxy status endpoint — only an allow-listed
// set of domains is reachable), so this connector's field mapping could
// not be verified against a live response during this build. The shape
// below matches PlanIt's documented API; confirm exact field names against
// a live call before relying on it in production.
//
// Like Companies House, planning-register entries publish applicant/agent
// name and the site address, not a personal phone number — normalise()
// leaves phoneRaw unset and the pipeline rejects those records rather than
// fabricating contact details.

interface PlanItRecord {
  uid?: string;
  name?: string;
  description?: string;
  address?: string;
  postcode?: string;
  area_name?: string;
  url?: string;
  applicant_name?: string;
  agent_name?: string;
  start_date?: string;
  app_state?: string;
}

interface PlanItResponse {
  records?: PlanItRecord[];
  total?: number;
}

export const ukPlanningConnector: DataSourceConnector = {
  key: "uk_planning_planit",
  market: "UK",
  lawfulBasis: "legitimate_interest",

  async fetch(params) {
    const authority = String(params.authority ?? "").trim();
    const pageSize = Math.min(Number(params.pageSize ?? 20), 100);

    const url = new URL("https://www.planit.org.uk/api/applications");
    if (authority) url.searchParams.set("auth", authority);
    if (params.recentMonths) url.searchParams.set("recent_months", String(params.recentMonths));
    url.searchParams.set("pg_sz", String(pageSize));

    const res = await politeFetch(url.toString());
    if (!res.ok) {
      throw new Error(`PlanIt fetch failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as PlanItResponse;
    const retrievedAt = new Date().toISOString();
    return (body.records ?? []).map((record) => ({
      data: record as unknown as Record<string, unknown>,
      sourceUrl: record.url ?? "https://www.planit.org.uk/",
      retrievedAt,
    }));
  },

  normalise(raw: RawRecord): NormalisedLead | null {
    const record = raw.data as PlanItRecord;
    if (!record.uid) return null;
    const [firstName, ...rest] = (record.applicant_name ?? "").split(" ");
    return {
      externalRef: record.uid,
      firstName: firstName || undefined,
      lastName: rest.length ? rest.join(" ") : undefined,
      companyName: record.agent_name,
      countryHint: "GB",
      addressLine1: record.address,
      city: record.area_name,
      postcode: record.postcode,
      custom: {
        description: record.description,
        app_state: record.app_state,
        start_date: record.start_date,
        source: "uk_planning_planit",
      },
    };
  },
};
