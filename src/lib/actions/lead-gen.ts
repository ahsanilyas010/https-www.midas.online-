"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { countryToRegion } from "@/lib/campaign-options";

export interface LeadGenResult {
  error?: string;
  ok?: boolean;
  note?: string;
  assigned?: number;
  skipped?: number;
}

// Lead gen does the work; managers may use the same screens.
const ROLES = ["lead_gen", "super_admin", "ops_manager"];

const uuid = z.string().uuid();
const phoneHash = (p: string) => createHash("sha256").update(p).digest("hex");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null));

const leadSchema = z.object({
  campaign_id: z.string().uuid("Choose a campaign."),
  data_source_id: z
    .string()
    .trim()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || uuid.safeParse(v).success, "Invalid data source."),
  first_name: optionalText(80),
  last_name: optionalText(80),
  company_name: optionalText(120),
  job_title: optionalText(120),
  email: optionalText(200).refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email."),
  phone: z.string().trim().max(40),
  country: z.string().trim().max(4),
  city: optionalText(80),
  region: optionalText(80),
  postcode: optionalText(20),
});

function refresh() {
  revalidatePath("/leadgen", "layout");
  revalidatePath("/admin/campaigns", "layout");
}

// Manual single-lead entry. The lead enters unowned and unscreened
// (screening_status = 'pending', phone_hash set by the database trigger):
// it can be handed to an agent, but it is not dialable until a manager has
// screened it. A number on the suppression list, or already a lead, is
// refused (checked workspace-wide through a hashes-only RPC, because lead
// gen cannot read the suppression list or other people's leads).
export async function addLeadGenLead(_prev: LeadGenResult, formData: FormData): Promise<LeadGenResult> {
  const profile = await requireProfile();
  if (!ROLES.includes(profile.role)) return { error: "Only lead gen or an admin can add leads." };

  const get = (k: string) => String(formData.get(k) ?? "");
  const parsed = leadSchema.safeParse({
    campaign_id: get("campaign_id"),
    data_source_id: get("data_source_id"),
    first_name: get("first_name"),
    last_name: get("last_name"),
    company_name: get("company_name"),
    job_title: get("job_title"),
    email: get("email"),
    phone: get("phone"),
    country: get("country"),
    city: get("city"),
    region: get("region"),
    postcode: get("postcode"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid lead." };
  const v = parsed.data;

  const supabase = await createRealClient();
  const { data: campaigns, error: campErr } = await supabase.rpc("leadgen_campaigns");
  if (campErr) return { error: campErr.message };
  const campaign = (campaigns ?? []).find((c) => c.id === v.campaign_id);
  if (!campaign) return { error: "Campaign not found." };

  if (v.data_source_id) {
    const { data: src } = await supabase
      .from("data_sources")
      .select("id, is_active")
      .eq("id", v.data_source_id)
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();
    if (!src) return { error: "Data source not found." };
    if (!src.is_active) return { error: "That data source is inactive." };
  }

  const region = countryToRegion(v.country || campaign.country);
  const fullName = [v.first_name, v.last_name].filter(Boolean).join(" ") || null;

  if (!v.phone) {
    if (!fullName && !v.company_name && !v.email) {
      return { error: "Enter a phone number, or at least a name, company or email." };
    }
    const { error } = await supabase.from("unphoned_contacts").insert({
      workspace_id: profile.workspace_id,
      campaign_id: campaign.id,
      data_source_id: v.data_source_id,
      full_name: fullName,
      email: v.email,
      company_name: v.company_name,
      city: v.city,
      country_hint: region,
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true, note: "Saved as a contact that still needs a phone number." };
  }

  let phoneE164: string;
  try {
    const p = parsePhoneNumberWithError(v.phone, region as never);
    if (!p.isPossible()) throw new Error("invalid");
    phoneE164 = p.number;
  } catch {
    return { error: `"${v.phone}" doesn't parse as a valid phone number.` };
  }

  const { data: known, error: knownErr } = await supabase.rpc("leadgen_known_hashes", {
    p_hashes: [phoneHash(phoneE164)],
  });
  if (knownErr) return { error: knownErr.message };
  if ((known ?? []).some((k) => k.kind === "suppressed")) {
    return { error: "This number is on the suppression list and can't be added." };
  }
  if ((known ?? []).length > 0) return { error: "This phone number is already a lead." };

  const { error } = await supabase.from("leads").insert({
    workspace_id: profile.workspace_id,
    campaign_id: campaign.id,
    data_source_id: v.data_source_id,
    phone_e164: phoneE164,
    first_name: v.first_name,
    last_name: v.last_name,
    company_name: v.company_name,
    job_title: v.job_title,
    email: v.email,
    city: v.city,
    region: v.region,
    postcode: v.postcode,
    country_code: region,
    source: "manual",
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: true, note: "Lead added. It is pending screening." };
}

// Hand the selected leads to one sales agent (leadgen_assign_leads). The
// RPC re-checks workspace, roster and eligibility; this action only
// validates shape and the caller's role.
export async function assignLeadsToAgent(
  leadIds: string[],
  campaignId: string,
  agentId: string,
): Promise<LeadGenResult> {
  const profile = await requireProfile();
  if (!ROLES.includes(profile.role)) return { error: "Only lead gen or an admin can hand off leads." };
  if (!z.array(uuid).min(1).max(2000).safeParse(leadIds).success || !uuid.safeParse(campaignId).success || !uuid.safeParse(agentId).success) {
    return { error: "Select leads, a campaign and an agent." };
  }
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("leadgen_assign_leads", {
    p_lead_ids: leadIds,
    p_campaign_id: campaignId,
    p_agent_id: agentId,
  });
  if (error) return { error: error.message };
  const r = data as { assigned?: number; skipped?: number } | null;
  refresh();
  if (!r?.assigned) {
    return { error: "None of those leads could be assigned (already owned, suppressed, failed screening, or in another campaign)." };
  }
  return { ok: true, assigned: r.assigned, skipped: r.skipped ?? 0 };
}

// Round-robin: each selected lead goes to the rostered agent with the fewest
// open leads. With no selection, every eligible unassigned lead in the
// campaign is distributed (leadgen_auto_assign).
export async function autoAssignLeads(campaignId: string, leadIds?: string[]): Promise<LeadGenResult> {
  const profile = await requireProfile();
  if (!ROLES.includes(profile.role)) return { error: "Only lead gen or an admin can hand off leads." };
  if (!uuid.safeParse(campaignId).success) return { error: "Choose a campaign." };
  if (leadIds && !z.array(uuid).min(1).max(2000).safeParse(leadIds).success) return { error: "Invalid selection." };
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("leadgen_auto_assign", {
    p_campaign_id: campaignId,
    ...(leadIds ? { p_lead_ids: leadIds } : {}),
  });
  if (error) return { error: error.message };
  const r = data as { assigned?: number; skipped?: number } | null;
  refresh();
  if (!r?.assigned) {
    return { error: "Nothing to assign: no eligible unassigned leads in that selection." };
  }
  return { ok: true, assigned: r.assigned, skipped: r.skipped ?? 0 };
}

export interface AssignableAgent {
  id: string;
  name: string;
  agentCode: string | null;
  onRoster: boolean;
  openLeads: number;
}

// Sales agents a lead can go to, with whether each is on the campaign's
// roster (names only; lead gen has no direct read on profiles).
export async function listAssignableAgents(campaignId: string | null): Promise<AssignableAgent[]> {
  const profile = await requireProfile();
  if (!ROLES.includes(profile.role)) return [];
  if (campaignId && !uuid.safeParse(campaignId).success) return [];
  const supabase = await createRealClient();
  const { data } = await supabase.rpc("leadgen_assignable_agents", campaignId ? { p_campaign_id: campaignId } : {});
  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.full_name ?? "Agent",
    agentCode: a.agent_code,
    onRoster: a.on_roster,
    openLeads: a.open_leads,
  }));
}
