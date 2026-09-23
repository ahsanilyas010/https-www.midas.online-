"use server";

import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/lib/supabase/types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// Agent-facing edit — deliberately narrower than the admin lead form.
// `leads_update_agent` RLS (assigned_to = auth.uid()) is what actually
// enforces "only your own leads"; the SELECT just below relies on the
// matching `leads_select` RLS clause to return null for anything not
// assigned to the caller, so a lead-not-found error also covers "not
// yours" without a separate ownership check.
export async function updateAssignedLead(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const leadId = String(formData.get("lead_id") ?? "");
  if (!leadId) return { error: "Missing lead." };

  const { data: existing } = await supabase
    .from("leads")
    .select("id, country_code, custom")
    .eq("id", leadId)
    .maybeSingle();
  if (!existing) return { error: "Lead not found, or it isn't assigned to you." };

  const firstName = String(formData.get("first_name") ?? "").trim() || null;
  const lastName = String(formData.get("last_name") ?? "").trim() || null;
  const companyName = String(formData.get("company_name") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const addressLine1 = String(formData.get("address_line1") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const postcode = String(formData.get("postcode") ?? "").trim() || null;
  const agentNotes = String(formData.get("agent_notes") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  const update: TablesUpdate<"leads"> = {
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    email,
    address_line1: addressLine1,
    city,
    region,
    postcode,
  };

  if (phoneRaw) {
    try {
      const parsed = parsePhoneNumberWithError(phoneRaw, existing.country_code as never);
      if (!parsed.isPossible()) throw new Error("invalid");
      update.phone_e164 = parsed.number;
      update.phone_raw = phoneRaw;
    } catch {
      return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
    }
  }

  const currentCustom = (existing.custom as Record<string, unknown> | null) ?? {};
  const nextCustom = { ...currentCustom };
  if (agentNotes) nextCustom.agent_notes = agentNotes;
  else delete nextCustom.agent_notes;
  update.custom = nextCustom as Json;

  const { error } = await supabase.from("leads").update(update).eq("id", leadId);

  if (error) {
    if (error.code === "23505") {
      return { error: "That phone number is already used by another lead in this campaign." };
    }
    return { error: error.message };
  }

  revalidatePath("/workspace/leads");
  return { ok: true };
}
