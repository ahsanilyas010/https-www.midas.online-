import "server-only";
import type { ScreeningProvider, ScreeningResult } from "./types";
import { ProviderNotConfiguredError } from "./types";

// Section 4.4 / Phase 8. The US National DNC Registry does have a
// documented API (the FTC's DNC.gov batch-processing service), but access
// requires a live Subscription Account Number (SAN) per area code being
// called — nothing to integrate against without one. See spec section 9,
// item 7: "TPS/CTPS licence or screening bureau account for UK, and a US
// National DNC Subscription Account Number... nothing goes live without
// these." Stops at the configuration check for the same reason as the
// TPS/CTPS providers.
export const usNationalDncProvider: ScreeningProvider = {
  key: "us_national_dnc",
  suppressionReason: "us_national_dnc",
  async screen(): Promise<ScreeningResult> {
    const san = process.env.US_DNC_SAN;
    const orgId = process.env.US_DNC_ORG_ID;
    if (!san || !orgId) {
      throw new ProviderNotConfiguredError("US National DNC", ["US_DNC_SAN", "US_DNC_ORG_ID"]);
    }
    // TODO(Phase 8, post-SAN-registration): real call against the FTC DNC
    // batch API once a SAN covering the target area codes exists. Persist
    // the response file to Storage and return its path as `evidencePath`.
    throw new Error(
      "US_DNC_SAN/US_DNC_ORG_ID are set but the DNC.gov batch API integration is not implemented yet " +
        "— use ManualEvidenceProvider until this is wired up.",
    );
  },
};
