import "server-only";
import type { ScreeningProvider, ScreeningResult } from "./types";
import { demoMatch } from "./tps";

// Demo build: US National DNC screening is simulated with a small,
// deterministic hit rate on +1 numbers. No FTC subscription is involved.
export const usNationalDncProvider: ScreeningProvider = {
  key: "us_national_dnc",
  suppressionReason: "us_national_dnc",
  async screen(phoneNumbers: string[]): Promise<ScreeningResult> {
    return {
      matched: phoneNumbers.filter((p) => p.startsWith("+1") && demoMatch(p + "dnc", 5)),
      evidencePath: `demo/us-dnc-${Date.now()}.csv`,
      providerReference: `DEMO-DNC-${Date.now().toString(36).toUpperCase()}`,
    };
  },
};
