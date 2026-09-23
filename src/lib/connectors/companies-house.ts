import "server-only";
import type { DataSourceConnector, NormalisedLead, RawRecord } from "./types";
import { politeFetch } from "./polite-fetch";

// Section 6.4 — "Companies House API | UK | Free public API | Company
// records, officers, SIC codes, filing history. Register for a free key.
// B2B only." This is the public Search API
// (https://developer-specs.company-information.service.gov.uk), Basic
// auth with the API key as the username and an empty password.
//
// Companies House returns company identity and registered-office address,
// not a contact phone number — so normalise() below leaves phoneRaw unset
// for every record. The import pipeline rejects phone-less records rather
// than inventing one; scraping a phone number off a company's own website
// is a separate, narrower, explicitly-out-of-scope build (see spec 6.4,
// "firmographic B2B enrichment"). This connector's honest job is
// company-identity discovery for a target list, not a dialable lead on
// its own.

interface CompaniesHouseSearchItem {
  company_number?: string;
  title?: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  description?: string;
  address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
}

interface CompaniesHouseSearchResponse {
  items?: CompaniesHouseSearchItem[];
  total_results?: number;
}

export const companiesHouseConnector: DataSourceConnector = {
  key: "companies_house",
  market: "UK",
  lawfulBasis: "legitimate_interest",

  async fetch(params) {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) throw new Error("COMPANIES_HOUSE_API_KEY is not configured.");

    const query = String(params.query ?? "").trim();
    if (!query) throw new Error("A search query (e.g. SIC description or region) is required.");
    const itemsPerPage = Math.min(Number(params.itemsPerPage ?? 20), 100);

    const url = new URL("https://api.company-information.service.gov.uk/search/companies");
    url.searchParams.set("q", query);
    url.searchParams.set("items_per_page", String(itemsPerPage));

    const res = await politeFetch(url.toString(), {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
    });
    if (!res.ok) {
      throw new Error(`Companies House search failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as CompaniesHouseSearchResponse;
    const retrievedAt = new Date().toISOString();
    return (body.items ?? []).map((item) => ({
      data: item as unknown as Record<string, unknown>,
      sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${item.company_number ?? ""}`,
      retrievedAt,
    }));
  },

  normalise(raw: RawRecord): NormalisedLead | null {
    const item = raw.data as CompaniesHouseSearchItem;
    if (!item.company_number || !item.title) return null;
    return {
      externalRef: item.company_number,
      companyName: item.title,
      countryHint: "GB",
      addressLine1: item.address?.address_line_1,
      city: item.address?.locality,
      region: item.address?.region,
      postcode: item.address?.postal_code,
      custom: {
        company_status: item.company_status,
        company_type: item.company_type,
        date_of_creation: item.date_of_creation,
        source: "companies_house",
      },
    };
  },
};
