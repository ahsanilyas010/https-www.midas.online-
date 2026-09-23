"use server";

import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// Turns a phone-less contact into a real, dialable lead. RLS on
// `unphoned_contacts` (agent sees only their own assigned rows) covers "not
// found" for both "doesn't exist" and "not yours" — same pattern as
// `updateAssignedLead`. The actual insert into `leads` happens inside
// `promote_unphoned_contact`, which re-checks ownership itself since it
// runs as SECURITY DEFINER.
export async function promoteContact(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const contactId = String(formData.get("contact_id") ?? "");
  if (!contactId) return { error: "Missing contact." };

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
    const parsed = parsePhoneNumberWithError(phoneRaw, contact.country_hint as never);
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
    if (error.code === "23505") {
      return { error: "That phone number is already used by another lead in this campaign." };
    }
    return { error: error.message };
  }

  revalidatePath("/workspace/leads");
  return { ok: true };
}
