"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { countryToRegion } from "@/lib/campaign-options";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// Turns a phone-less contact into a real lead via promote_unphoned_contact()
// (migration 075): the one path that runs the suppression + duplicate check
// and inserts the lead as screening_status = 'pending' (not dialable until a
// manager screens it). Migration 072 then hands the new lead to the agent.
export async function promoteContact(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["agent", "team_lead", "super_admin", "ops_manager"].includes(profile.role)) {
    return { error: "You can't promote contacts." };
  }

  const contactId = String(formData.get("contact_id") ?? "");
  if (!z.string().uuid().safeParse(contactId).success) return { error: "Missing contact." };

  const supabase = await createRealClient();
  const { data: contact } = await supabase
    .from("unphoned_contacts")
    .select("id, country_hint, promoted_lead_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { error: "Contact not found, or it isn't assigned to you." };
  if (contact.promoted_lead_id) return { error: "This contact has already been queued as a lead." };

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!phoneRaw) return { error: "Enter a phone number." };

  let phoneE164: string;
  try {
    const parsed = parsePhoneNumberWithError(phoneRaw, countryToRegion(contact.country_hint) as never);
    if (!parsed.isPossible()) throw new Error("invalid");
    phoneE164 = parsed.number;
  } catch {
    return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
  }

  const { error } = await supabase.rpc("promote_unphoned_contact", {
    p_contact_id: contactId,
    p_phone_e164: phoneE164,
    p_phone_raw: phoneRaw,
  });
  if (error) {
    if (error.code === "23505") return { error: "That phone number already exists as a lead." };
    return { error: error.message };
  }

  revalidatePath("/callsheet");
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}
