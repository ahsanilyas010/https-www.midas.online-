"use server";

import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

// Non-negotiable #4: opt-outs are global and instant. This insert path has
// no validation that can reject it beyond "is this a phone number", no
// rate limit, and no role restriction — any signed-in user can suppress a
// number. If everything else in the app is broken, this must still work.
export async function addSuppressionEntry(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const countryHint = String(formData.get("country") ?? "GB");
  const reason = String(formData.get("reason") ?? "internal_optout") as Enums<"suppression_reason">;
  const note = String(formData.get("evidence_note") ?? "").trim() || null;

  if (!phoneRaw) return { error: "Phone number is required." };

  let phoneE164: string;
  try {
    const parsed = parsePhoneNumberWithError(phoneRaw, countryHint as never);
    if (!parsed.isValid()) throw new Error("invalid");
    phoneE164 = parsed.number;
  } catch {
    return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("suppression_list").insert({
    phone_e164: phoneE164,
    reason,
    evidence_note: note,
    added_by: user?.id ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Already suppressed." };
    }
    return { error: error.message };
  }

  // Best-effort denormalised status on any matching lead rows this caller's
  // RLS can reach (their own assigned lead, or all of them for a manager).
  // The real, unconditional gate is v_dialable_leads joining against
  // suppression_list — every lead with this number is unreachable through
  // the dial queue the instant the insert above commits, regardless of
  // whether every row's own do_not_call/status column gets touched here.
  await supabase
    .from("leads")
    .update({ do_not_call: true, status: "suppressed" })
    .eq("phone_e164", phoneE164);

  revalidatePath("/admin/compliance");
  return { ok: true };
}
