"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  assigned?: number;
}

// Section 6.3 — putting an agent on a campaign's roster. This is a
// separate step from assigning individual leads: campaign_assignments is
// what auto-top-up reads to know who to distribute leads to, and what
// getAssignedCampaigns() (workspace.ts) reads to decide which campaigns
// an agent even sees leads from.
export async function assignAgentToCampaign(
  campaignId: string,
  userId: string,
  dailyTarget: number,
): Promise<ActionResult> {
  console.error("[DIAG assignAgentToCampaign] called", { campaignId, userId, dailyTarget });
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  console.error("[DIAG assignAgentToCampaign] caller", { callerId: caller?.id ?? null });
  // .select() matters here: an upsert that RLS filters to zero rows
  // succeeds without an error (same footgun as assignLead below), so
  // without checking the returned rows this reported a clean "added"
  // toast while the roster stayed untouched.
  const { data, error } = await supabase
    .from("campaign_assignments")
    .upsert(
      { campaign_id: campaignId, user_id: userId, daily_target: dailyTarget },
      { onConflict: "campaign_id,user_id" },
    )
    .select("campaign_id");

  console.error("[DIAG assignAgentToCampaign] upsert result", { data, error });

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Couldn't add that agent — the campaign or agent may not exist, or you may not have access." };
  }
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

export async function removeAgentFromCampaign(campaignId: string, userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Leads already assigned to this agent on this campaign stay assigned —
  // pulling someone off a roster shouldn't silently orphan what they were
  // already working. Free them up separately if that's the intent.
  const { data, error } = await supabase
    .from("campaign_assignments")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .select("campaign_id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That agent wasn't on this roster — nothing to remove." };
  }
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

// Section 3.5 — a campaign only shows up as "Live" and only feeds
// v_dialable_leads' downstream UI cues once someone deliberately flips
// this; it never happens implicitly on creation.
export async function setCampaignActive(campaignId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ is_active: isActive })
    .eq("id", campaignId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Campaign not found, or you don't have access to it." };
  }
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

export async function assignLead(leadId: string, userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // .select() matters here: an UPDATE that RLS filters to zero rows
  // succeeds without an error, so without checking the returned rows this
  // reported a clean success while changing nothing.
  const { data, error } = await supabase
    .from("leads")
    .update({ assigned_to: userId, assigned_at: new Date().toISOString(), status: "assigned" })
    .eq("id", leadId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That lead couldn't be assigned — it may not exist, or you may not have access to it." };
  }
  revalidatePath("/admin/campaigns", "layout");
  return { ok: true };
}

// Section 6.3 — auto-top-up: keep each agent's ready queue at N leads.
// Distributes unassigned, screened-passed leads round-robin across the
// campaign's assigned agents, topping each one up toward their
// daily_target (default 20) rather than dumping everything on whoever's
// first.
export async function autoAssignReadyLeads(campaignId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("campaign_assignments")
    .select("user_id, daily_target")
    .eq("campaign_id", campaignId);

  if (!assignments || assignments.length === 0) {
    return { error: "No agents are assigned to this campaign yet." };
  }

  const { data: currentCounts } = await supabase
    .from("leads")
    .select("assigned_to")
    .eq("campaign_id", campaignId)
    .not("assigned_to", "is", null)
    .in("status", ["assigned", "in_progress", "callback"]);

  const currentLoad = new Map<string, number>();
  for (const row of currentCounts ?? []) {
    if (row.assigned_to) currentLoad.set(row.assigned_to, (currentLoad.get(row.assigned_to) ?? 0) + 1);
  }

  const need = assignments.map((a) => ({
    userId: a.user_id,
    remaining: Math.max((a.daily_target ?? 20) - (currentLoad.get(a.user_id) ?? 0), 0),
  }));

  const totalNeeded = need.reduce((sum, a) => sum + a.remaining, 0);
  if (totalNeeded === 0) {
    return { error: "Every agent is already at their target queue depth." };
  }

  const { data: pool } = await supabase
    .from("leads")
    .select("id")
    .eq("campaign_id", campaignId)
    .is("assigned_to", null)
    .eq("screening_status", "passed")
    .eq("do_not_call", false)
    .order("created_at")
    .limit(totalNeeded);

  if (!pool || pool.length === 0) {
    return { error: "No unassigned, screened leads available to assign." };
  }

  let poolIndex = 0;
  let assignedCount = 0;
  const nowIso = new Date().toISOString();

  // Round-robin: one lead per agent per pass until each agent's need is
  // met or the pool runs out.
  let stillNeedy = need.filter((a) => a.remaining > 0);
  while (stillNeedy.length > 0 && poolIndex < pool.length) {
    for (const agent of stillNeedy) {
      if (poolIndex >= pool.length) break;
      const lead = pool[poolIndex++];
      // Same reasoning as assignLead: count a row only if it actually
      // came back updated, not merely "didn't error".
      const { data: updated, error } = await supabase
        .from("leads")
        .update({ assigned_to: agent.userId, assigned_at: nowIso, status: "assigned" })
        .eq("id", lead.id)
        .select("id");
      if (!error && updated && updated.length > 0) {
        assignedCount++;
        agent.remaining--;
      }
    }
    stillNeedy = stillNeedy.filter((a) => a.remaining > 0);
  }

  revalidatePath("/admin/campaigns", "layout");
  return { ok: true, assigned: assignedCount };
}
