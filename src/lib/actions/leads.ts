"use server";

import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export async function createDataSource(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "manual_entry");
  const lawfulBasis = String(formData.get("lawful_basis") ?? "");

  if (!name || !lawfulBasis) {
    return { error: "Name and lawful basis are required." };
  }

  const { error } = await supabase.from("data_sources").insert({
    name,
    source_type: sourceType,
    lawful_basis: lawfulBasis,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

// Section 6.2 / Phase 2 — manual single-lead entry. Provenance is
// mandatory and cannot be skipped: every lead must resolve to a
// data_source_id (with its lawful_basis) and an acquired_at.
export async function createManualLead(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const campaignId = String(formData.get("campaign_id") ?? "");
  const dataSourceId = String(formData.get("data_source_id") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim() || null;
  const lastName = String(formData.get("last_name") ?? "").trim() || null;
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const countryHint = String(formData.get("country") ?? "GB");
  const city = String(formData.get("city") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;

  if (!campaignId || !dataSourceId || !phoneRaw) {
    return { error: "Campaign, data source and phone number are required." };
  }

  let phoneE164: string;
  try {
    const parsed = parsePhoneNumberWithError(phoneRaw, countryHint as never);
    // See pipeline.ts — isPossible() rather than isValid() so a real but
    // unusually-formatted number isn't rejected at import time. Suppression
    // screening below is unconditional and unaffected by this.
    if (!parsed.isPossible()) throw new Error("invalid");
    phoneE164 = parsed.number;
  } catch {
    return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .single();
  if (!campaign) return { error: "Campaign not found." };

  // The single most expensive bug in this system is a mis-normalised
  // number that skips suppression screening — so check it here, at write
  // time, in addition to the dialable view filtering it out later.
  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("phone_e164")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  const { error } = await supabase.from("leads").insert({
    campaign_id: campaignId,
    data_source_id: dataSourceId,
    first_name: firstName,
    last_name: lastName,
    phone_e164: phoneE164,
    phone_raw: phoneRaw,
    city,
    region,
    country_code: countryHint,
    status: suppressed ? "suppressed" : "new",
    screening_status: suppressed ? "blocked" : "unscreened",
    do_not_call: Boolean(suppressed),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "This phone number is already in this campaign." };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

// A manually-entered lead still needs to clear the same gate as an
// imported one. Since there's no bureau integration yet (Phase 8), this
// records an internal pass — sufficient for the internal suppression check,
// not a substitute for a real TPS/CTPS/DNC run before a campaign goes live.
export async function markScreened(leadId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("phone_e164")
    .eq("id", leadId)
    .single();
  if (!lead) return { error: "Lead not found." };

  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("phone_e164")
    .eq("phone_e164", lead.phone_e164)
    .maybeSingle();

  if (suppressed) return { error: "This number is suppressed and cannot be screened as passed." };

  const { error } = await supabase
    .from("leads")
    .update({ screening_status: "passed", screened_at: new Date().toISOString(), status: "ready" })
    .eq("id", leadId);

  if (error) return { error: error.message };
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}
