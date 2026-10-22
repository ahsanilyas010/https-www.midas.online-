"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { countryToRegion } from "@/lib/campaign-options";
import { AGENT_LEAD_STATUSES, LEAD_STATUSES } from "@/lib/lead-status";
import { localInputToIso } from "@/lib/callsheet/derive";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const emailSchema = z.string().email();
const isManager = (role: string) => role === "super_admin" || role === "ops_manager";

// Edit of a lead from the call sheet.
//  - An agent (or team lead) edits a lead assigned to them through
//    update_my_lead() (SECURITY DEFINER): agents have no UPDATE policy on
//    leads, and the function only touches contact fields, notes and the
//    call-sheet extras, only on a lead assigned to auth.uid(). Changing the
//    phone number sends the lead back to screening_status = 'pending'.
//  - A manager updates any lead in their workspace directly (RLS
//    leads_update_manager). Managers cannot change the phone number here:
//    that has to go through the screening-aware paths.
export async function updateAssignedLead(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  const manager = isManager(profile.role);
  if (!manager && profile.role !== "agent" && profile.role !== "team_lead") {
    return { error: "You can't edit leads." };
  }

  const leadId = String(formData.get("lead_id") ?? "");
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Missing lead." };

  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const email = text("email", 200);
  if (email && !emailSchema.safeParse(email).success) return { error: "Enter a valid email." };

  const apptLocal = text("appointment_at", 40);
  let apptIso: string | null = null;
  if (apptLocal) {
    apptIso = localInputToIso(apptLocal, profile.timezone);
    if (!apptIso) return { error: "Enter a valid appointment date and time." };
  }

  const website = text("website", 300);
  if (website && /^(javascript|data|vbscript):/i.test(website)) return { error: "Enter a valid website." };

  const supabase = await createRealClient();

  if (manager) {
    const { data, error } = await supabase
      .from("leads")
      .update({
        first_name: text("first_name", 80) || null,
        last_name: text("last_name", 80) || null,
        company_name: text("company_name", 120) || null,
        email: email || null,
        address_line1: text("address_line1", 200) || null,
        city: text("city", 80) || null,
        region: text("region", 80) || null,
        postcode: text("postcode", 20) || null,
        agent_notes: text("agent_notes", 4000) || null,
        website: website || null,
        contact_name: text("contact_name", 200) || null,
        next_step: text("next_step", 500) || null,
        appointment_at: apptIso,
      })
      .eq("id", leadId)
      .eq("workspace_id", profile.workspace_id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Lead not found." };
    revalidatePath("/callsheet");
    return { ok: true };
  }

  const { data: existing } = await supabase
    .from("leads")
    .select("id, phone_e164, country_code, campaigns(country)")
    .eq("id", leadId)
    .eq("assigned_to", profile.id)
    .maybeSingle();
  if (!existing) return { error: "Lead not found, or it isn't assigned to you." };

  let phoneE164: string | null = null;
  const phoneRaw = text("phone", 40);
  if (phoneRaw && phoneRaw !== existing.phone_e164) {
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
    p_extra: {
      website,
      contact_name: text("contact_name", 200),
      next_step: text("next_step", 500),
      appointment_at: apptIso ?? "",
    },
  });
  if (error) return { error: error.message };

  revalidatePath("/callsheet");
  return { ok: true };
}

const fieldSchema = z.enum(["agent_notes", "next_step"]);

// Inline edit of one text field on a card (notes / next step). For agents the
// other columns are read back and passed through unchanged, because
// update_my_lead() replaces the whole contact block.
export async function saveLeadField(leadId: string, field: string, value: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const manager = isManager(profile.role);
  if (!manager && profile.role !== "agent" && profile.role !== "team_lead") return { error: "You can't edit leads." };
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Missing lead." };
  const f = fieldSchema.safeParse(field);
  if (!f.success) return { error: "Unknown field." };
  const v = value.trim().slice(0, f.data === "agent_notes" ? 4000 : 500);

  const supabase = await createRealClient();
  if (manager) {
    const { data, error } = await supabase
      .from("leads")
      .update(f.data === "agent_notes" ? { agent_notes: v || null } : { next_step: v || null })
      .eq("id", leadId)
      .eq("workspace_id", profile.workspace_id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Lead not found." };
  } else {
    const { data: l } = await supabase.from("leads").select("*").eq("id", leadId).eq("assigned_to", profile.id).maybeSingle();
    if (!l) return { error: "Lead not found, or it isn't assigned to you." };
    // update_my_lead() needs the number; a lead with none is completed through
    // "Add a phone number" first.
    if (!l.phone_e164) return { error: "Add a phone number to this lead first." };
    const { error } = await supabase.rpc("update_my_lead", {
      p_lead_id: leadId,
      p_first_name: l.first_name ?? "",
      p_last_name: l.last_name ?? "",
      p_company_name: l.company_name ?? "",
      p_email: l.email ?? "",
      p_phone_e164: l.phone_e164,
      p_address_line1: l.address_line1 ?? "",
      p_city: l.city ?? "",
      p_region: l.region ?? "",
      p_postcode: l.postcode ?? "",
      p_agent_notes: f.data === "agent_notes" ? v : (l.agent_notes ?? ""),
      p_extra: f.data === "next_step" ? { next_step: v } : {},
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/callsheet");
  return { ok: true };
}

export async function setMyLeadStatus(leadId: string, status: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const manager = isManager(profile.role);
  if (!manager && profile.role !== "agent" && profile.role !== "team_lead") {
    return { error: "You can't update this lead." };
  }
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Missing lead." };

  const supabase = await createRealClient();
  if (manager) {
    if (!LEAD_STATUSES.includes(status as never)) return { error: "Invalid status." };
    const { data, error } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", leadId)
      .eq("workspace_id", profile.workspace_id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Lead not found." };
  } else {
    if (!AGENT_LEAD_STATUSES.includes(status as never)) return { error: "Invalid status." };
    const { error } = await supabase.rpc("set_my_lead_status", { p_lead_id: leadId, p_status: status });
    if (error) return { error: error.message };
  }
  revalidatePath("/callsheet");
  return { ok: true };
}
