"use server";

import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { fetchSetupProgress } from "@/lib/guide/server";
import type { SetupProgress } from "@/lib/guide/checklist";
import type { RealTablesUpdate } from "@/lib/supabase/real-types";

export interface GuideActionResult {
  ok?: boolean;
  error?: string;
}

type GuidePatch = Pick<RealTablesUpdate<"user_guide_state">, "tour_seen_at" | "tour_completed_at" | "checklist_dismissed_at">;

// Writes only the caller's own row (RLS enforces this too); the workspace id
// comes from their profile, never from the client.
async function save(patch: GuidePatch): Promise<GuideActionResult> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("user_guide_state")
    .upsert({ user_id: profile.id, workspace_id: profile.workspace_id, ...patch }, { onConflict: "user_id" });
  if (error) return { error: error.message };
  return { ok: true };
}

const now = () => new Date().toISOString();

export async function markTourSeen(): Promise<GuideActionResult> {
  return save({ tour_seen_at: now() });
}

export async function markTourCompleted(): Promise<GuideActionResult> {
  const t = now();
  return save({ tour_seen_at: t, tour_completed_at: t });
}

export async function hideChecklist(): Promise<GuideActionResult> {
  return save({ checklist_dismissed_at: now() });
}

export async function showChecklist(): Promise<GuideActionResult> {
  return save({ checklist_dismissed_at: null });
}

// Forget everything: the welcome dialog and the dashboard card come back.
export async function resetGuide(): Promise<GuideActionResult> {
  return save({ tour_seen_at: null, tour_completed_at: null, checklist_dismissed_at: null });
}

// Fresh setup counts for the checklist (managers only; the RPC refuses anyone
// else). Used to keep the checklist current without reloading the page.
export async function refreshSetupProgress(): Promise<SetupProgress | null> {
  return fetchSetupProgress();
}
