import "server-only";
import type { ScreeningProvider, ScreeningResult } from "./types";
import { ProviderNotConfiguredError } from "./types";

// Section 4.4 / Phase 8 — "Real TPS/CTPS... provider integration once
// accounts are live." Unlike Companies House or a Socrata portal, UK TPS/
// CTPS bureaux (e.g. Amvia, TPS Bureau, VoiceSage) don't share one public
// API shape — each is "sales-led with pricing on application" per the
// spec, so there's no documented contract to implement against yet. This
// intentionally stops at the configuration check: wire the real HTTP call
// in once Ahsan has a bureau account and its API docs (spec section 9)
// rather than guessing a shape that would silently pass/fail incorrectly.
// Until then, ManualEvidenceProvider covers the same compliance
// requirement — a bureau's response file, uploaded and retained as
// evidence — without needing an API at all.

function makeBureauProvider(
  key: "tps" | "ctps",
  suppressionReason: "tps" | "ctps",
): ScreeningProvider {
  return {
    key,
    suppressionReason,
    async screen(): Promise<ScreeningResult> {
      const apiKey = process.env.TPS_BUREAU_API_KEY;
      const endpoint = process.env.TPS_BUREAU_ENDPOINT;
      if (!apiKey || !endpoint) {
        throw new ProviderNotConfiguredError(key.toUpperCase(), [
          "TPS_BUREAU_API_KEY",
          "TPS_BUREAU_ENDPOINT",
        ]);
      }
      // TODO(Phase 8, post-bureau-signup): real HTTP call against the
      // bureau's documented endpoint once one is under contract. The
      // response must be persisted to Storage and its path returned as
      // `evidencePath` — "no evidence, no pass" per spec 4.4.
      throw new Error(
        `${key.toUpperCase()} credentials are set but no bureau API integration is implemented yet — ` +
          `this is a real account with no confirmed API contract to code against. Use ManualEvidenceProvider.`,
      );
    },
  };
}

export const tpsProvider = makeBureauProvider("tps", "tps");
export const ctpsProvider = makeBureauProvider("ctps", "ctps");
