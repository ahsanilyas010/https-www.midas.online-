"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { countryToRegion } from "@/lib/campaign-options";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  note?: string;
}

const MANAGER_ROLES = ["super_admin", "ops_manager"];

// Same algorithm as compute_phone_hash() (migration 047). The database
// trigger remains the source of truth for leads.phone_hash; this copy is
// only used to pre-check suppression / duplicates before inserting.
function phoneHash(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null));

const leadSchema = z.object({
  campaign_id: z.string().uuid("Choose a campaign."),
  first_name: optionalText(80),
  last_name: optionalText(80),
  company_name: optionalText(120),
  job_title: optionalText(120),
  email: optionalText(200).refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email."),
  phone: z.string().trim().max(40),
  country: z.string().trim().max(4),
  address_line1: optionalText(200),
  city: optionalText(80),
  region: optionalText(80),
  postcode: optionalText(20),
  assigned_to: z
    .string()
    .trim()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Invalid agent."),
});

// Manual single-lead entry by a manager. A lead with a phone number goes
// in as screening_status = 'pending' (phone_hash is computed by the
// database trigger) and is only dialable once screened. Without a phone
// number it is stored as a contact that still needs a number, which the
// assigned agent can promote from "My leads".
export async function createManualLead(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!MANAGER_ROLES.includes(profile.role)) return { error: "Only an admin can add leads." };

  const get = (k: string) => String(formData.get(k) ?? "");
  const parsed = leadSchema.safeParse({
    campaign_id: get("campaign_id"),
    first_name: get("first_name"),
    last_name: get("last_name"),
    company_name: get("company_name"),
    job_title: get("job_title"),
    email: get("email"),
    phone: get("phone"),
    country: get("country"),
    address_line1: get("address_line1"),
    city: get("city"),
    region: get("region"),
    postcode: get("postcode"),
    assigned_to: get("assigned_to"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid lead." };
  const v = parsed.data;

  const supabase = await createRealClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, country")
    .eq("id", v.campaign_id)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!campaign) return { error: "Campaign not found." };

  const region = countryToRegion(v.country || campaign.country);
  const fullName = [v.first_name, v.last_name].filter(Boolean).join(" ") || null;

  if (!v.phone) {
    if (!fullName && !v.company_name && !v.email) {
      return { error: "Enter a phone number, or at least a name, company or email." };
    }
    const { error } = await supabase.from("unphoned_contacts").insert({
      workspace_id: profile.workspace_id,
      campaign_id: campaign.id,
      full_name: fullName,
      email: v.email,
      company_name: v.company_name,
      city: v.city,
      country_hint: region,
      assigned_to: v.assigned_to,
    });
    if (error) return { error: error.message };
    revalidatePath("/admin/campaigns", "layout");
    revalidatePath("/workspace/leads");
    return { ok: true, note: "Saved as a contact that still needs a phone number." };
  }

  let phoneE164: string;
  try {
    const parsedPhone = parsePhoneNumberWithError(v.phone, region as never);
    if (!parsedPhone.isPossible()) throw new Error("invalid");
    phoneE164 = parsedPhone.number;
  } catch {
    return { error: `"${v.phone}" doesn't parse as a valid phone number.` };
  }

  const hash = phoneHash(phoneE164);
  const [{ data: suppressed }, { data: duplicate }] = await Promise.all([
    supabase
      .from("suppression_list")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("phone_hash", hash)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .eq("campaign_id", campaign.id)
      .eq("phone_hash", hash)
      .limit(1)
      .maybeSingle(),
  ]);
  if (suppressed) return { error: "This number is on the suppression list and can't be added." };
  if (duplicate) return { error: "This phone number is already in this campaign." };

  const { error } = await supabase.from("leads").insert({
    workspace_id: profile.workspace_id,
    campaign_id: campaign.id,
    phone_e164: phoneE164,
    first_name: v.first_name,
    last_name: v.last_name,
    company_name: v.company_name,
    job_title: v.job_title,
    email: v.email,
    address_line1: v.address_line1,
    city: v.city,
    region: v.region,
    postcode: v.postcode,
    country_code: region,
    assigned_to: v.assigned_to,
    source: "manual",
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

// A manually-entered lead still has to clear the same gate as an imported
// one. This runs the internal suppression screen (screen_leads): a number
// on the suppression list is marked failed and can never pass.
export async function markScreened(leadId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!MANAGER_ROLES.includes(profile.role)) return { error: "Only an admin can screen leads." };
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Invalid lead." };

  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("screen_leads", { p_lead_ids: [leadId] });
  if (error) return { error: error.message };
  if (!data) return { error: "This number is suppressed (or already screened) and can't be marked as passed." };

  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}
