"use server";

import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { manualScreeningProvider } from "@/lib/compliance/screening";

// Lead upload itself now goes through the mapped importer
// (src/lib/leads/mapped-import.ts, action in lead-import.ts). What is left
// here is the manual "screen this batch" action.

export async function screenLeadBatch(batchId: string): Promise<{ error?: string; screenedCount?: number }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can screen a batch." };
  }
  const supabase = await createRealClient();
  try {
    const { screenedCount } = await manualScreeningProvider.screenBatch(supabase, { batchId, evidenceUrl: null });
    return { screenedCount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not screen the batch." };
  }
}
