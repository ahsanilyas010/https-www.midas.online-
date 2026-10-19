import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// Spec: "Screening (TPS/CTPS for UK, National DNC for US) is a stub that
// records screened_at and an evidence file; expose a ScreeningProvider
// interface for a real vendor." This is that interface — swap in a real
// vendor's implementation later without touching the call sites below.
export interface ScreeningProvider {
  readonly name: string;
  screenBatch(
    supabase: SupabaseClient<RealDatabase>,
    input: { batchId: string; evidenceUrl: string | null },
  ): Promise<{ screenedCount: number }>;
}

// The only implementation today: marks every pending lead in the batch as
// passed via the screen_lead_batch() RPC (supabase/migrations/00000000000052_screening.sql).
// A real provider would call out to TPS/CTPS or the National DNC registry
// and could produce 'failed' rows too — this stub cannot.
export const manualScreeningProvider: ScreeningProvider = {
  name: "manual",
  async screenBatch(supabase, { batchId, evidenceUrl }) {
    const { data, error } = await supabase.rpc("screen_lead_batch", {
      p_batch_id: batchId,
      // The SQL parameter accepts null; generated types mark it non-nullable.
      p_evidence_url: evidenceUrl as string,
    });
    if (error) throw error;
    return { screenedCount: data ?? 0 };
  },
};
