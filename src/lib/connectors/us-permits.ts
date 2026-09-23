import "server-only";
import type { DataSourceConnector, NormalisedLead, RawRecord } from "./types";
import { politeFetch } from "./polite-fetch";

// Section 6.4 — "US building permits | US | Municipal open data | Socrata
// and ArcGIS endpoints from city/county portals. Public record, structured,
// free. Start with the client's target metros."
//
// Every municipality on Socrata's SODA platform (data.<city>.gov) exposes
// the same query API but a different column schema per dataset, so this
// connector is generic: the dataset location and the field mapping both
// come from the `data_sources.config` jsonb, not from hardcoded column
// names for one city. That also survives the fact that this environment's
// network policy blocks arbitrary outbound hosts (confirmed via the agent
// proxy status endpoint), so no specific city's live schema could be
// verified during this build — set `config.fieldMap` from the target
// portal's real column names (visible on the dataset's "API docs" tab)
// before switching a source on.
//
// Many permit datasets include a contractor/applicant phone number
// (public business-licensing information) — map it via `fieldMap.phone`
// when the target dataset has one. When it doesn't, leave it unset: the
// pipeline rejects phone-less records rather than fabricating one.

export interface SocrataConfig {
  domain: string; // e.g. "data.cityofchicago.org"
  datasetId: string; // e.g. "ydr8-5enu"
  appToken?: string;
  where?: string; // raw SoQL $where clause, e.g. "issue_date > '2026-01-01'"
  fieldMap: {
    externalRef?: string;
    permitType?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    region?: string;
    postcode?: string;
  };
}

function isSocrataConfig(v: unknown): v is SocrataConfig {
  const c = v as Partial<SocrataConfig> | null;
  return !!c && typeof c.domain === "string" && typeof c.datasetId === "string" && !!c.fieldMap;
}

export const usPermitsConnector: DataSourceConnector = {
  key: "us_permits_socrata",
  market: "US",
  lawfulBasis: "legitimate_interest",

  async fetch(params) {
    const config = params.config;
    if (!isSocrataConfig(config)) {
      throw new Error(
        "This data source's config must set { domain, datasetId, fieldMap } for the target Socrata portal.",
      );
    }
    const limit = Math.min(Number(params.limit ?? 100), 1000);

    const url = new URL(`https://${config.domain}/resource/${config.datasetId}.json`);
    url.searchParams.set("$limit", String(limit));
    if (config.where) url.searchParams.set("$where", config.where);

    const res = await politeFetch(url.toString(), {
      headers: config.appToken ? { "X-App-Token": config.appToken } : {},
    });
    if (!res.ok) {
      throw new Error(`Socrata fetch failed: ${res.status} ${await res.text()}`);
    }

    const rows = (await res.json()) as Record<string, unknown>[];
    const retrievedAt = new Date().toISOString();
    return rows.map((row) => ({
      data: { ...row, __fieldMap: config.fieldMap },
      sourceUrl: `https://${config.domain}/resource/${config.datasetId}`,
      retrievedAt,
    }));
  },

  normalise(raw: RawRecord): NormalisedLead | null {
    const { __fieldMap, ...row } = raw.data as Record<string, unknown> & {
      __fieldMap: SocrataConfig["fieldMap"];
    };
    const get = (key?: string) => (key ? (row[key] as string | undefined) : undefined);

    const phoneRaw = get(__fieldMap.phone);
    const externalRef = get(__fieldMap.externalRef);
    if (!externalRef) return null;

    return {
      externalRef,
      firstName: get(__fieldMap.firstName),
      lastName: get(__fieldMap.lastName),
      companyName: get(__fieldMap.companyName),
      phoneRaw,
      countryHint: "US",
      addressLine1: get(__fieldMap.addressLine1),
      city: get(__fieldMap.city),
      region: get(__fieldMap.region),
      postcode: get(__fieldMap.postcode),
      custom: { permit_type: get(__fieldMap.permitType), source: "us_permits_socrata" },
    };
  },
};
