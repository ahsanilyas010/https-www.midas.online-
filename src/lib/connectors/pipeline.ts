import "server-only";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { NormalisedLead } from "./types";

// Section 6.4 — "Every fetched record routes through the same import
// pipeline as a CSV upload — validation, then suppression screening, then
// commit. There is no bypass." This is that pipeline: connectors, the
// vendor CSV path, and the inbound web form all call importLeads().
//
// Acceptance criterion: "a record with no lawful_basis cannot be
// committed" — enforced by requiring a resolvable data_source_id up front.
// data_sources.lawful_basis is NOT NULL at the schema level, so any row
// that resolves at all necessarily carries one; a record with no
// data_source_id is refused before any insert is attempted.

export interface ImportOutcome {
  imported: number;
  rejected: number;
  rejections: { record: NormalisedLead; reason: string }[];
  // Ids of the rows actually inserted this run — lets a caller (e.g. a
  // direct-to-agent upload) act on exactly this batch's leads afterward
  // without guessing at a created_at window.
  insertedIds: string[];
}

export async function importLeads(params: {
  supabase: SupabaseClient<Database>;
  campaignId: string;
  dataSourceId: string;
  batchId?: string | null;
  records: NormalisedLead[];
}): Promise<ImportOutcome> {
  const { supabase, campaignId, dataSourceId, batchId, records } = params;

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("id, lawful_basis")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!dataSource) {
    throw new Error("No lawful_basis on file for this data source — refusing to commit.");
  }

  const outcome: ImportOutcome = { imported: 0, rejected: 0, rejections: [], insertedIds: [] };

  for (const record of records) {
    if (!record.phoneRaw) {
      outcome.rejected += 1;
      outcome.rejections.push({ record, reason: "No phone number available from source." });
      continue;
    }

    let phoneE164: string;
    try {
      const parsed = parsePhoneNumberWithError(record.phoneRaw, record.countryHint as never);
      // isPossible() (length/shape only) rather than isValid() (matches a
      // real allocated range) — vendor lists are messy and a real number
      // outside libphonenumber's known ranges shouldn't be thrown away at
      // import time. This only affects whether a number can be normalised
      // to E.164; suppression/DNC screening below is unconditional and
      // completely separate from this check.
      if (!parsed.isPossible()) throw new Error("invalid");
      phoneE164 = parsed.number;
    } catch {
      outcome.rejected += 1;
      outcome.rejections.push({
        record,
        reason: `"${record.phoneRaw}" doesn't parse as a valid phone number.`,
      });
      continue;
    }

    const { data: suppressed } = await supabase
      .from("suppression_list")
      .select("phone_e164")
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    const { data: inserted, error } = await supabase.from("leads").insert({
      campaign_id: campaignId,
      data_source_id: dataSourceId,
      batch_id: batchId ?? null,
      external_ref: record.externalRef ?? null,
      first_name: record.firstName ?? null,
      last_name: record.lastName ?? null,
      company_name: record.companyName ?? null,
      job_title: record.jobTitle ?? null,
      phone_e164: phoneE164,
      phone_raw: record.phoneRaw,
      email: record.email ?? null,
      address_line1: record.addressLine1 ?? null,
      city: record.city ?? null,
      region: record.region ?? null,
      postcode: record.postcode ?? null,
      country_code: record.countryHint,
      // The verbatim consent text has no dedicated column — it's stored in
      // `custom` alongside the submitting IP, since `consent_evidence_path`
      // is a storage path for uploaded evidence files, not inline text.
      custom: (record.consent
        ? { ...record.custom, consent_text: record.consent.text, submitted_ip: record.consent.submittedIp }
        : (record.custom ?? {})) as Json,
      status: suppressed ? "suppressed" : "new",
      screening_status: suppressed ? "blocked" : "unscreened",
      do_not_call: Boolean(suppressed),
      consent_status: record.consent?.status ?? null,
      consent_source: record.consent?.source ?? null,
      consent_captured_at: record.consent?.capturedAt ?? null,
    }).select("id").single();

    if (error || !inserted) {
      outcome.rejected += 1;
      outcome.rejections.push({
        record,
        reason: error?.code === "23505" ? "Duplicate phone number in this campaign." : (error?.message ?? "Insert failed."),
      });
      continue;
    }

    outcome.imported += 1;
    outcome.insertedIds.push(inserted.id);
  }

  return outcome;
}
