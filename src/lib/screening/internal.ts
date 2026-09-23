import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ScreeningProvider, ScreeningResult } from "./types";

// Always runs, regardless of market — checks the numbers already on
// suppression_list (internal opt-outs, verbal DNC, previously-matched
// bureau results, complaints, etc). This is the one provider with no
// external dependency, so it's always available.
export function internalSuppressionProvider(supabase: SupabaseClient<Database>): ScreeningProvider {
  return {
    key: "internal",
    suppressionReason: "internal_optout",
    async screen(phoneNumbers: string[]): Promise<ScreeningResult> {
      if (phoneNumbers.length === 0) return { matched: [], evidencePath: null, providerReference: null };

      const matched: string[] = [];
      // Chunk to stay well under a single `in (...)` filter's practical size.
      for (let i = 0; i < phoneNumbers.length; i += 500) {
        const chunk = phoneNumbers.slice(i, i + 500);
        const { data } = await supabase
          .from("suppression_list")
          .select("phone_e164")
          .in("phone_e164", chunk);
        matched.push(...(data ?? []).map((d) => d.phone_e164));
      }

      return { matched, evidencePath: null, providerReference: "suppression_list" };
    },
  };
}
