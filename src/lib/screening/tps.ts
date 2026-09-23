import "server-only";
import type { ScreeningProvider, ScreeningResult } from "./types";

// Demo build: UK TPS / CTPS bureau screening is simulated. A number is
// "matched" when it is already on the suppression list, plus a small,
// deterministic sample of others so screening runs show realistic hits.
// No bureau account or credentials are involved.

export function demoMatch(phone: string, ratePercent: number) {
  let h = 0;
  for (const ch of phone) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 100 < ratePercent;
}

function makeBureauProvider(key: "tps" | "ctps", suppressionReason: "tps" | "ctps"): ScreeningProvider {
  return {
    key,
    suppressionReason,
    async screen(phoneNumbers: string[]): Promise<ScreeningResult> {
      return {
        matched: phoneNumbers.filter((p) => p.startsWith("+44") && demoMatch(p + key, 4)),
        evidencePath: `demo/${key}-${Date.now()}.csv`,
        providerReference: `DEMO-${key.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      };
    },
  };
}

export const tpsProvider = makeBureauProvider("tps", "tps");
export const ctpsProvider = makeBureauProvider("ctps", "ctps");
