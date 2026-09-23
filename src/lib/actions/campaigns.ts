"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { presetFor } from "@/lib/campaign-presets";

export interface CreateCampaignResult {
  error?: string;
  ok?: boolean;
}

export async function createCampaign(
  _prev: CreateCampaignResult,
  formData: FormData,
): Promise<CreateCampaignResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const clientId = String(formData.get("client_id") ?? "");
  const market = String(formData.get("market") ?? "");
  const audience = String(formData.get("audience") ?? "B2C");
  const vertical = String(formData.get("vertical") ?? "general");

  if (!name || !code || !clientId || !market) {
    return { error: "Name, code, client and market are required." };
  }

  const preset = presetFor(vertical, market);

  const { error } = await supabase.from("campaigns").insert({
    name,
    code,
    client_id: clientId,
    market,
    audience,
    vertical,
    risk_tier: preset.riskTier,
    requires_tps_screening: preset.requiresTps,
    requires_ctps_screening: preset.requiresCtps,
    requires_us_dnc_screening: preset.requiresUsDnc,
    screening_max_age_days: preset.screeningMaxAgeDays,
    is_active: false, // activation checklist (Phase 3.5) gates going live
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/campaigns");
  return { ok: true };
}

export interface CreateClientResult {
  error?: string;
  ok?: boolean;
}

export async function createClientRecord(
  _prev: CreateClientResult,
  formData: FormData,
): Promise<CreateClientResult> {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const isDataController = formData.get("is_data_controller") === "on";

  if (!name) return { error: "Client name is required." };

  const { error } = await supabase.from("clients").insert({
    name,
    country,
    contact_email: contactEmail,
    is_data_controller: isDataController,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/campaigns");
  return { ok: true };
}

export async function updateClientRecord(
  _prev: CreateClientResult,
  formData: FormData,
): Promise<CreateClientResult> {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const isDataController = formData.get("is_data_controller") === "on";

  if (!id) return { error: "Missing client id." };
  if (!name) return { error: "Client name is required." };

  const { data, error } = await supabase
    .from("clients")
    .update({
      name,
      country,
      contact_email: contactEmail,
      is_data_controller: isDataController,
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Client not found, or you don't have access to it." };
  }

  revalidatePath("/admin/campaigns");
  return { ok: true };
}
