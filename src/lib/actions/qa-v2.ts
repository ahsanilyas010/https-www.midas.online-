"use server";

import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { RealTables } from "@/lib/supabase/real-types";

const DEFAULT_CRITERIA: { label: string; weight: number; is_fatal: boolean; sort: number }[] = [
  { label: "Opened with the required disclosure", weight: 3, is_fatal: true, sort: 10 },
  { label: "Verified caller identity/qualification", weight: 2, is_fatal: false, sort: 20 },
  { label: "Handled objections per the script", weight: 2, is_fatal: false, sort: 30 },
  { label: "Accurate, complete notes", weight: 1, is_fatal: false, sort: 40 },
  { label: "Professional tone throughout", weight: 2, is_fatal: false, sort: 50 },
];

// Lazily provisions one default scorecard template the first time a
// manager/QA analyst opens the QA queue — a full template editor is a
// later refinement; the schema (qa_templates/qa_criteria) already
// supports more than one, weighted, with fatal rules, per spec.
async function ensureDefaultTemplate(workspaceId: string) {
  const supabase = await createRealClient();
  const { data: existing } = await supabase.from("qa_templates").select("*").eq("workspace_id", workspaceId).eq("is_active", true).limit(1).maybeSingle();
  if (existing) return existing;

  const { data: template, error } = await supabase
    .from("qa_templates")
    .insert({ workspace_id: workspaceId, name: "Standard call quality" })
    .select("*")
    .single();
  if (error || !template) throw error ?? new Error("could not create default QA template");

  await supabase.from("qa_criteria").insert(DEFAULT_CRITERIA.map((c) => ({ workspace_id: workspaceId, template_id: template.id, ...c })));
  return template;
}

export interface QaQueueItem {
  call: RealTables<"calls">;
  agentName: string | null;
  leadName: string | null;
}

export async function getQaQueue(): Promise<{ template: RealTables<"qa_templates">; criteria: RealTables<"qa_criteria">[]; queue: QaQueueItem[] }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager" && profile.role !== "qa_analyst") {
    throw new Error("Only QA and admins can access the QA queue.");
  }

  const template = await ensureDefaultTemplate(profile.workspace_id);
  const supabase = await createRealClient();
  const { data: criteria } = await supabase.from("qa_criteria").select("*").eq("template_id", template.id).order("sort");

  const { data: scoredCallIds } = await supabase.from("qa_scores").select("call_id").eq("workspace_id", profile.workspace_id);
  const scored = new Set((scoredCallIds ?? []).map((r) => r.call_id));

  const { data: calls } = await supabase
    .from("calls")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .not("disposition_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const unscored = (calls ?? []).filter((c) => !scored.has(c.id));

  // calls.agent_id/lead_id both reference auth.users/leads without a
  // declared FK PostgREST can embed through here, so resolve names with
  // two small lookups instead.
  const agentIds = [...new Set(unscored.map((c) => c.agent_id))];
  const leadIds = [...new Set(unscored.map((c) => c.lead_id))];
  const [{ data: agents }, { data: leads }] = await Promise.all([
    agentIds.length ? supabase.from("profiles").select("id, full_name").in("id", agentIds) : Promise.resolve({ data: [] }),
    leadIds.length ? supabase.from("leads").select("id, full_name").in("id", leadIds) : Promise.resolve({ data: [] }),
  ]);
  const agentNames = new Map((agents ?? []).map((a) => [a.id, a.full_name]));
  const leadNames = new Map((leads ?? []).map((l) => [l.id, l.full_name]));

  const queue: QaQueueItem[] = unscored.map((c) => ({
    call: c,
    agentName: agentNames.get(c.agent_id) ?? null,
    leadName: leadNames.get(c.lead_id) ?? null,
  }));

  return { template, criteria: criteria ?? [], queue };
}

export interface SubmitQaScoreInput {
  callId: string;
  agentId: string;
  templateId: string;
  results: { criterionId: string; met: boolean; weight: number; isFatal: boolean }[];
  coachingNotes: string;
}

export async function submitQaScore(input: SubmitQaScoreInput): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager" && profile.role !== "qa_analyst") {
    return { error: "Only QA and admins can submit a score." };
  }

  const totalWeight = input.results.reduce((sum, r) => sum + r.weight, 0);
  const earnedWeight = input.results.filter((r) => r.met).reduce((sum, r) => sum + r.weight, 0);
  const totalScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const fatalBreach = input.results.some((r) => r.isFatal && !r.met);
  const passed = !fatalBreach && totalScore >= 70;

  const supabase = await createRealClient();
  const { data: score, error } = await supabase
    .from("qa_scores")
    .insert({
      workspace_id: profile.workspace_id,
      call_id: input.callId,
      template_id: input.templateId,
      qa_analyst_id: profile.id,
      agent_id: input.agentId,
      total_score: totalScore,
      passed,
      fatal_breach: fatalBreach,
      coaching_notes: input.coachingNotes || null,
    })
    .select("id")
    .single();
  if (error || !score) return { error: error?.message ?? "Could not save the score." };

  const { error: resultsError } = await supabase
    .from("qa_criterion_results")
    .insert(input.results.map((r) => ({ qa_score_id: score.id, criterion_id: r.criterionId, met: r.met })));
  if (resultsError) return { error: resultsError.message };

  revalidatePath("/quality", "page");
  return {};
}

export async function getMyQaScores(): Promise<RealTables<"qa_scores">[]> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data } = await supabase
    .from("qa_scores")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .eq("agent_id", profile.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function acknowledgeQaScore(id: string): Promise<{ error?: string }> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("qa_scores")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("agent_id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/quality", "page");
  return {};
}
