"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { countryToRegion } from "@/lib/campaign-options";
import { AGENT_LEAD_STATUSES } from "@/lib/lead-status";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const emailSchema = z.string().email();

// Agent-facing edit of a lead assigned to the caller. The write goes
// through update_my_lead() (SECURITY DEFINER): agents have no UPDATE
// policy on leads, and the function only touches contact fields + notes,
// only on a lead assigned to auth.uid(). Changing the phone number sends
// the lead back to screening_status = 'pending'.
export async function updateAssignedLead(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "agent" && profile.role !== "team_lead") {
    return { error: "Only agents can edit their assigned leads." };
  }

  const leadId = String(formData.get("lead_id") ?? "");
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Missing lead." };

  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const email = text("email", 200);
  if (email && !emailSchema.safeParse(email).success) return { error: "Enter a valid email." };

  const supabase = await createRealClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("id, phone_e164, country_code, campaigns(country)")
    .eq("id", leadId)
    .eq("assigned_to", profile.id)
    .maybeSingle();
  if (!existing) return { error: "Lead not found, or it isn't assigned to you." };

  let phoneE164: string | null = null;
  const phoneRaw = text("phone", 40);
  if (phoneRaw) {
    const region = countryToRegion(
      existing.country_code ?? (existing.campaigns as { country: string | null } | null)?.country,
    );
    try {
      const parsed = parsePhoneNumberWithError(phoneRaw, region as never);
      if (!parsed.isPossible()) throw new Error("invalid");
      phoneE164 = parsed.number;
    } catch {
      return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
    }
  }

  const finalPhone = phoneE164 ?? existing.phone_e164;
  if (!finalPhone) return { error: "Enter a phone number." };

  const { error } = await supabase.rpc("update_my_lead", {
    p_lead_id: leadId,
    p_first_name: text("first_name", 80),
    p_last_name: text("last_name", 80),
    p_company_name: text("company_name", 120),
    p_email: email,
    p_phone_e164: finalPhone,
    p_address_line1: text("address_line1", 200),
    p_city: text("city", 80),
    p_region: text("region", 80),
    p_postcode: text("postcode", 20),
    p_agent_notes: text("agent_notes", 4000),
  });
  if (error) return { error: error.message };

  revalidatePath("/workspace/leads");
  return { ok: true };
}

export async function setMyLeadStatus(leadId: string, status: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "agent" && profile.role !== "team_lead") {
    return { error: "Only agents can update their leads." };
  }
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Missing lead." };
  if (!AGENT_LEAD_STATUSES.includes(status as never)) return { error: "Invalid status." };

  const supabase = await createRealClient();
  const { error } = await supabase.rpc("set_my_lead_status", { p_lead_id: leadId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/workspace/leads");
  return { ok: true };
}
