"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { internalSuppressionProvider } from "@/lib/screening/internal";
import { manualEvidenceScreen } from "@/lib/screening/manual-evidence";
import type { ScreeningResult } from "@/lib/screening/types";
import { parseVendorFile } from "@/lib/connectors/vendor-csv";
import type { Enums } from "@/lib/supabase/types";

type SuppressionReason = Enums<"suppression_reason">;

export interface ActionResult {
  error?: string;
  ok?: boolean;
  screened?: number;
  matched?: number;
}

// Section 4.4 — applies a provider's result to every leads row it covered:
// matched numbers go on suppression_list and get suppressed immediately;
// everything else is marked passed with a fresh 28-day (per-campaign)
// clock. Always logs a suppression_runs row — "no evidence, no pass"
// applies to the audit trail as much as to the individual lead.
const PROVIDER_TO_SUPPRESSION_REASON: Record<string, SuppressionReason> = {
  TPS: "tps",
  CTPS: "ctps",
  US_NATIONAL_DNC: "us_national_dnc",
  STATE_DNC: "state_dnc",
};

async function applyScreeningResult(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  campaignId: string;
  providerLabel: string;
  ranBy: string;
  phoneToLeadId: Map<string, string>;
  result: ScreeningResult;
  screeningMaxAgeDays: number;
}): Promise<{ screened: number; matched: number; suppressionFailures: string[] }> {
  const { supabase, campaignId, providerLabel, ranBy, phoneToLeadId, result, screeningMaxAgeDays } = params;
  const matchedSet = new Set(result.matched);
  const now = new Date();

  const { data: run } = await supabase
    .from("suppression_runs")
    .insert({
      campaign_id: campaignId,
      provider: providerLabel,
      ran_by: ranBy,
      numbers_submitted: phoneToLeadId.size,
      numbers_matched: matchedSet.size,
      evidence_path: result.evidencePath,
      provider_reference: result.providerReference,
      valid_until: new Date(now.getTime() + screeningMaxAgeDays * 86400000).toISOString(),
    })
    .select("id")
    .single();

  // A failure in the matched branch fails OPEN — the number stays
  // dialable while the run reports it as suppressed. That is the single
  // most expensive failure mode in this system, so these errors are
  // collected and surfaced rather than discarded. (The unmatched branch
  // fails closed: a lead that doesn't reach 'passed' simply stays
  // unscreened and invisible to v_dialable_leads, which is safe.)
  const suppressionFailures: string[] = [];

  for (const [phone, leadId] of phoneToLeadId) {
    if (matchedSet.has(phone)) {
      const { error: suppressError } = await supabase.from("suppression_list").upsert(
        {
          phone_e164: phone,
          reason: PROVIDER_TO_SUPPRESSION_REASON[providerLabel] ?? "internal_optout",
          added_by: ranBy,
          lead_id: leadId,
          evidence_note: `Matched by ${providerLabel} screening run${run ? ` ${run.id}` : ""}.`,
        },
        { onConflict: "phone_e164", ignoreDuplicates: true },
      );
      const { error: leadError } = await supabase
        .from("leads")
        .update({ do_not_call: true, status: "suppressed", screening_status: "blocked", dnc_reason: providerLabel })
        .eq("id", leadId);

      if (suppressError || leadError) {
        suppressionFailures.push(`${phone}: ${(suppressError ?? leadError)!.message}`);
      }
    } else {
      await supabase
        .from("leads")
        .update({
          screening_status: "passed",
          screened_at: now.toISOString(),
          screening_run_id: run?.id ?? null,
        })
        .eq("id", leadId);
    }
  }

  return { screened: phoneToLeadId.size, matched: matchedSet.size, suppressionFailures };
}

async function loadUnscreenedPhones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
) {
  const { data: leads } = await supabase
    .from("leads")
    .select("id, phone_e164")
    .eq("campaign_id", campaignId)
    .in("screening_status", ["unscreened", "pending", "expired"]);

  const phoneToLeadId = new Map<string, string>();
  for (const l of leads ?? []) phoneToLeadId.set(l.phone_e164, l.id);
  return phoneToLeadId;
}

// InternalSuppressionProvider always runs and needs no bureau account —
// the one screening path available from day one.
export async function runInternalScreening(campaignId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("screening_max_age_days")
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found." };

  const phoneToLeadId = await loadUnscreenedPhones(supabase, campaignId);
  if (phoneToLeadId.size === 0) return { error: "Nothing to screen — every lead is already current." };

  const result = await internalSuppressionProvider(supabase).screen(Array.from(phoneToLeadId.keys()));
  const outcome = await applyScreeningResult({
    supabase,
    campaignId,
    providerLabel: "INTERNAL",
    ranBy: profile.id,
    phoneToLeadId,
    result,
    screeningMaxAgeDays: campaign.screening_max_age_days,
  });

  revalidatePath("/admin/compliance");
  revalidatePath("/admin/campaigns");
  const { suppressionFailures, ...counts } = outcome;
  if (suppressionFailures.length > 0) {
    return {
      error:
        `Screened ${counts.screened}, but ${suppressionFailures.length} matched number(s) could NOT be suppressed — ` +
        `they may still be dialable. Fix and re-run before dialling: ${suppressionFailures.slice(0, 3).join("; ")}`,
    };
  }
  return { ok: true, ...counts };
}

// ManualEvidenceProvider — upload a bureau's own response file (CSV/XLSX
// with a phone-number column of the numbers THAT MATCHED) as the retained
// evidence artefact, for TPS/CTPS/US DNC/state-DNC runs done outside this
// system pending a live API integration.
export async function uploadManualScreeningEvidence(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager"].includes(profile.role)) return { error: "Not authorized." };

  const campaignId = String(formData.get("campaign_id") ?? "");
  const providerLabel = String(formData.get("provider") ?? "");
  const phoneColumn = String(formData.get("phone_column") ?? "").trim();
  const file = formData.get("file");

  if (!campaignId || !providerLabel || !phoneColumn || !(file instanceof File)) {
    return { error: "Campaign, provider, phone-number column and a file are required." };
  }

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("screening_max_age_days")
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found." };

  const phoneToLeadId = await loadUnscreenedPhones(supabase, campaignId);
  if (phoneToLeadId.size === 0) return { error: "Nothing to screen — every lead is already current." };

  let matchedPhoneNumbers: string[];
  try {
    const { rows } = parseVendorFile(await file.arrayBuffer());
    matchedPhoneNumbers = rows
      .map((r) => String(r[phoneColumn] ?? "").trim())
      .filter((p) => p.length > 0);
  } catch {
    return { error: "Could not parse the uploaded file." };
  }

  const result = await manualEvidenceScreen({
    file,
    matchedPhoneNumbers,
    providerReference: `manual:${providerLabel}`,
  });

  const outcome = await applyScreeningResult({
    supabase,
    campaignId,
    providerLabel,
    ranBy: profile.id,
    phoneToLeadId,
    result,
    screeningMaxAgeDays: campaign.screening_max_age_days,
  });

  revalidatePath("/admin/compliance");
  revalidatePath("/admin/campaigns");
  const { suppressionFailures, ...counts } = outcome;
  if (suppressionFailures.length > 0) {
    return {
      error:
        `Screened ${counts.screened}, but ${suppressionFailures.length} matched number(s) could NOT be suppressed — ` +
        `they may still be dialable. Fix and re-run before dialling: ${suppressionFailures.slice(0, 3).join("; ")}`,
    };
  }
  return { ok: true, ...counts };
}
