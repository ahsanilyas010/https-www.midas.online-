"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { ensureOnRosters } from "@/lib/leads/roster";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// Bulk actions behind the Leads page (/admin/leads): the super admin picks any
// of the uploaded rows and hands them to an agent, screens them, or moves them
// into a campaign. Every statement is scoped to the caller's workspace and the
// manager-only RLS policies on leads / unphoned_contacts still apply.

export interface BulkResult {
  error?: string;
  ok?: boolean;
  count?: number;
  rostered?: number;
}

const MANAGERS = ["super_admin", "ops_manager"];
const uuid = z.string().uuid();
const MAX_IDS = 2000;

function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return null;
  const out = [...new Set(ids.map(String))];
  return out.every((id) => uuid.safeParse(id).success) ? out : null;
}

async function requireManager() {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role)) return null;
  return profile;
}

async function assignableUser(supabase: SupabaseClient<RealDatabase>, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return "That person isn't in your workspace.";
  if (!data.is_active) return "That person's account is deactivated.";
  if (!["agent", "team_lead", "super_admin", "ops_manager"].includes(data.role)) return "Leads can only be assigned to agents, team leads or managers.";
  return null;
}

function touch() {
  revalidatePath("/admin/leads");
  revalidatePath("/admin/campaigns", "layout");
  revalidatePath("/admin/compliance");
  revalidatePath("/admin/data");
  revalidatePath("/callsheet");
  revalidatePath("/dial");
}

// Assign (userId) or unassign (null) a set of leads.
export async function bulkAssignLeads(leadIds: string[], userId: string | null): Promise<BulkResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can assign leads." };
  const ids = cleanIds(leadIds);
  if (!ids) return { error: "Pick at least one lead (up to 2,000 at a time)." };
  if (userId !== null && !uuid.safeParse(userId).success) return { error: "Invalid agent." };

  const supabase = await createRealClient();
  const ws = profile.workspace_id;
  if (userId) {
    const problem = await assignableUser(supabase, ws, userId);
    if (problem) return { error: problem };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ assigned_to: userId, ...(userId ? { assigned_by: profile.id } : {}) })
    .in("id", ids)
    .eq("workspace_id", ws)
    .select("id, campaign_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "None of those leads could be found." };

  let rostered = 0;
  if (userId) {
    try {
      rostered = await ensureOnRosters(supabase, ws, userId, data.map((l) => l.campaign_id).filter((c): c is string => Boolean(c)));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Assigned, but couldn't update the campaign roster." };
    }
  }
  touch();
  return { ok: true, count: data.length, rostered };
}

// Manual screening of a chosen set of leads (screen_leads: suppressed numbers
// fail, the rest pass). Not a live TPS/DNC lookup.
export async function bulkScreenLeads(leadIds: string[]): Promise<BulkResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can screen leads." };
  const ids = cleanIds(leadIds);
  if (!ids) return { error: "Pick at least one lead (up to 2,000 at a time)." };
  const supabase = await createRealClient();
  let passed = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("screen_leads", { p_lead_ids: ids.slice(i, i + 500) });
    if (error) return { error: error.message };
    passed += data ?? 0;
  }
  touch();
  return { ok: true, count: passed };
}

// Moves leads into a campaign (for rows that were uploaded without one, or
// into the wrong one). Phone numbers are not re-normalised; the campaign
// decides calling hours, attempts and the roster.
export async function bulkMoveLeadsToCampaign(leadIds: string[], campaignId: string): Promise<BulkResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can move leads." };
  const ids = cleanIds(leadIds);
  if (!ids) return { error: "Pick at least one lead (up to 2,000 at a time)." };
  if (!uuid.safeParse(campaignId).success) return { error: "Choose a campaign." };
  const supabase = await createRealClient();
  const ws = profile.workspace_id;
  const { data: campaign } = await supabase.from("campaigns").select("id").eq("id", campaignId).eq("workspace_id", ws).maybeSingle();
  if (!campaign) return { error: "Campaign not found." };

  const { data, error } = await supabase.from("leads").update({ campaign_id: campaignId }).in("id", ids).eq("workspace_id", ws).select("id, assigned_to");
  if (error) return { error: error.message };
  // Keep each assigned agent on the new campaign's roster.
  const agents = [...new Set((data ?? []).map((l) => l.assigned_to).filter((a): a is string => Boolean(a)))];
  try {
    for (const a of agents) await ensureOnRosters(supabase, ws, a, [campaignId]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Moved, but couldn't update the campaign roster." };
  }
  touch();
  return { ok: true, count: data?.length ?? 0 };
}

// Assign (or unassign) phone-less contacts. The agent sees them on their call
// sheet and adds the number they find; that promotes the contact to a lead.
export async function bulkAssignContacts(contactIds: string[], userId: string | null): Promise<BulkResult> {
  const profile = await requireManager();
  if (!profile) return { error: "Only an admin can assign contacts." };
  const ids = cleanIds(contactIds);
  if (!ids) return { error: "Pick at least one contact (up to 2,000 at a time)." };
  if (userId !== null && !uuid.safeParse(userId).success) return { error: "Invalid agent." };
  const supabase = await createRealClient();
  const ws = profile.workspace_id;
  if (userId) {
    const problem = await assignableUser(supabase, ws, userId);
    if (problem) return { error: problem };
  }
  const { data, error } = await supabase
    .from("unphoned_contacts")
    .update({ assigned_to: userId })
    .in("id", ids)
    .eq("workspace_id", ws)
    .is("promoted_lead_id", null)
    .select("id, campaign_id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "None of those contacts could be found (or they were already promoted)." };
  let rostered = 0;
  if (userId) {
    try {
      rostered = await ensureOnRosters(supabase, ws, userId, data.map((c) => c.campaign_id).filter((c): c is string => Boolean(c)));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Assigned, but couldn't update the campaign roster." };
    }
  }
  touch();
  return { ok: true, count: data.length, rostered };
}
