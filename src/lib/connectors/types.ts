// Section 6.4 — every connector implements this interface. A record from
// an API is not more trustworthy than one from a spreadsheet: both produce
// a NormalisedLead and both go through the same commit pipeline
// (validation, suppression screening, then insert).

export interface RawRecord {
  data: Record<string, unknown>;
  sourceUrl: string;
  retrievedAt: string;
}

export interface NormalisedLead {
  externalRef?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  jobTitle?: string;
  /** Undefined when the source doesn't carry a contact number (e.g. company
   * registries and planning registers publish identity/address, not phone
   * numbers) — the pipeline rejects such records rather than fabricating
   * one. */
  phoneRaw?: string;
  countryHint: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  region?: string;
  postcode?: string;
  custom?: Record<string, unknown>;
  /** Only set by the inbound web-form path — first-party consent capture,
   * per spec 6.4: "the consent text stored verbatim against the lead, and
   * the timestamp and IP retained." */
  consent?: {
    status: "express_written";
    source: string;
    capturedAt: string;
    text: string;
    submittedIp: string | null;
  };
}

export type LawfulBasis = "consent" | "legitimate_interest" | "contract" | "not_personal_data";

export interface DataSourceConnector {
  key: string;
  market: "UK" | "US";
  lawfulBasis: LawfulBasis;
  fetch(params: Record<string, unknown>): Promise<RawRecord[]>;
  normalise(raw: RawRecord): NormalisedLead | null;
}
