import "server-only";
import { createRealClient } from "@/lib/supabase/real";
import type { SetupProgress } from "@/lib/guide/checklist";

export interface GuideState {
  tourSeenAt: string | null;
  tourCompletedAt: string | null;
  checklistDismissedAt: string | null;
}

// Counts for the setup checklist: one RPC, scoped to the caller's workspace.
// Returns null for non-managers (the RPC refuses them) or on any error.
export async function fetchSetupProgress(): Promise<SetupProgress | null> {
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("setup_progress");
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as SetupProgress | undefined) ?? null;
}

// The caller's own guide state row (RLS: only theirs).
export async function fetchGuideState(userId: string): Promise<GuideState> {
  const supabase = await createRealClient();
  const { data } = await supabase
    .from("user_guide_state")
    .select("tour_seen_at, tour_completed_at, checklist_dismissed_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    tourSeenAt: data?.tour_seen_at ?? null,
    tourCompletedAt: data?.tour_completed_at ?? null,
    checklistDismissedAt: data?.checklist_dismissed_at ?? null,
  };
}
