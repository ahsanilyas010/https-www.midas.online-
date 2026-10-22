"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const MANAGERS = ["super_admin", "ops_manager"];
// Lead gen registers sources and imports files too (RLS limits it to inserting
// its own sources / batches / runs; it cannot edit or deactivate a source).
const IMPORTERS = ["super_admin", "ops_manager", "lead_gen"];

const SOURCE_TYPES = [
  "client_supplied",
  "vendor_licensed",
  "public_open_data",
  "inbound_web_form",
  "referral",
  "manual_entry",
] as const;
const LAWFUL_BASES = ["consent", "legitimate_interest", "contract", "not_personal_data"] as const;

const sourceSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(120),
  source_type: z.enum(SOURCE_TYPES),
  lawful_basis: z.enum(LAWFUL_BASES, { message: "A lawful basis is required." }),
  market: z.string().trim().max(20).optional(),
  provider_url: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function registerDataSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!IMPORTERS.includes(profile.role)) return { error: "Only an admin or lead gen can register data sources." };

  const parsed = sourceSchema.safeParse({
    name: formData.get("name"),
    source_type: formData.get("source_type"),
    lawful_basis: formData.get("lawful_basis"),
    market: formData.get("market") || undefined,
    provider_url: formData.get("provider_url") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createRealClient();
  const { error } = await supabase.from("data_sources").insert({
    workspace_id: profile.workspace_id,
    name: parsed.data.name,
    source_type: parsed.data.source_type,
    lawful_basis: parsed.data.lawful_basis,
    market: parsed.data.market ?? null,
    provider_url: parsed.data.provider_url ?? null,
    notes: parsed.data.notes ?? null,
    created_by: profile.id,
  });
  if (error) return { error: error.code === "23505" ? "A source with that name already exists." : error.message };
  revalidatePath("/admin/data");
  revalidatePath("/leadgen/leads");
  return { ok: true };
}

export async function setDataSourceActive(id: string, active: boolean): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role)) return { error: "Only an admin can change data sources." };
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("data_sources")
    .update({ is_active: active })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true };
}

// The vendor / client file import now lives in the shared mapped importer
// (src/lib/leads/mapped-import.ts, action in lead-import.ts), which this page's
// Import dialog calls with the chosen data source id.

export async function assignUnphonedContact(contactId: string, agentId: string | null): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role)) return { error: "Only an admin can assign contacts." };
  const supabase = await createRealClient();
  if (agentId) {
    const { data: a } = await supabase.from("profiles").select("id").eq("id", agentId).eq("workspace_id", profile.workspace_id).maybeSingle();
    if (!a) return { error: "Agent not found." };
  }
  const { error } = await supabase
    .from("unphoned_contacts")
    .update({ assigned_to: agentId })
    .eq("id", contactId)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true };
}

// Turns a phone-less contact into a real lead. promote_unphoned_contact()
// (migration 075) re-checks authorisation, the suppression list and
// duplicates itself, since it runs as SECURITY DEFINER.
export async function promoteContact(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireRealProfile();
  const contactId = String(formData.get("contact_id") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!z.string().uuid().safeParse(contactId).success) return { error: "Missing contact." };
  if (!phoneRaw) return { error: "Enter a phone number." };

  const supabase = await createRealClient();
  const { data: contact } = await supabase
    .from("unphoned_contacts")
    .select("id, country_hint, promoted_lead_id")
    .eq("id", contactId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!contact) return { error: "Contact not found, or it isn't assigned to you." };
  if (contact.promoted_lead_id) return { error: "This contact has already been queued as a lead." };

  let e164: string;
  try {
    const p = parsePhoneNumberWithError(phoneRaw, contact.country_hint as never);
    if (!p.isPossible()) throw new Error("invalid");
    e164 = p.number;
  } catch {
    return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
  }

  const { error } = await supabase.rpc("promote_unphoned_contact", {
    p_contact_id: contactId,
    p_phone_e164: e164,
    p_phone_raw: phoneRaw,
  });
  if (error) {
    if (error.code === "23505") return { error: "That phone number already exists as a lead." };
    return { error: error.message };
  }
  revalidatePath("/admin/data");
  return { ok: true };
}
