"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export interface ScorecardCriterion {
  key: string;
  label: string;
  weight: number;
  max_score: number;
  is_fatal: boolean;
}

export interface CallForReview {
  id: string;
  started_at: string;
  notes: string | null;
  talk_seconds: number | null;
  within_call_window: boolean;
  agent_id: string;
  profiles: { full_name: string } | null;
  leads: { first_name: string | null; last_name: string | null; phone_e164: string } | null;
  dispositions: { label: string } | null;
}

export async function getCallsNeedingReview(): Promise<CallForReview[]> {
  const supabase = await createClient();
  const { data: reviewed } = await supabase.from("qa_reviews").select("call_attempt_id");
  const reviewedIds = (reviewed ?? []).map((r) => r.call_attempt_id);

  let query = supabase
    .from("call_attempts")
    .select(
      "id, started_at, notes, talk_seconds, within_call_window, agent_id, profiles!call_attempts_agent_id_fkey(full_name), leads(first_name, last_name, phone_e164), dispositions(label)",
    )
    .order("started_at", { ascending: false })
    .limit(30);

  if (reviewedIds.length > 0) {
    query = query.not("id", "in", `(${reviewedIds.join(",")})`);
  }

  const { data } = await query;
  return (data ?? []) as unknown as CallForReview[];
}

export async function getActiveScorecard() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("qa_scorecards")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function submitQaReview(params: {
  callAttemptId: string;
  agentId: string;
  scorecardId: string;
  scores: Record<string, number>;
  criteria: ScorecardCriterion[];
  passThreshold: number;
  coachingNotes: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const totalWeight = params.criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = params.criteria.reduce(
    (sum, c) => sum + (params.scores[c.key] ?? 0) * (c.weight / c.max_score),
    0,
  );
  const totalScore = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  const fatalBreach = params.criteria.some(
    (c) => c.is_fatal && (params.scores[c.key] ?? 0) < c.max_score,
  );
  const passed = !fatalBreach && totalScore >= params.passThreshold;

  const { error } = await supabase.from("qa_reviews").insert({
    call_attempt_id: params.callAttemptId,
    scorecard_id: params.scorecardId,
    reviewer_id: user.id,
    agent_id: params.agentId,
    scores: params.scores,
    total_score: totalScore,
    passed,
    fatal_breach: fatalBreach,
    coaching_notes: params.coachingNotes || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/qa");
  return { ok: true };
}

export async function acknowledgeReview(reviewId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("qa_reviews")
    .update({ agent_acknowledged_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) return { error: error.message };
  revalidatePath("/qa");
  return { ok: true };
}
