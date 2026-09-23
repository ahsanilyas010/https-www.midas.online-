// Section 4.4 — "Build the provider layer as an interface with:
// InternalSuppressionProvider, TpsProvider/CtpsProvider, UsNationalDncProvider,
// StateDncProvider, ManualEvidenceProvider. Every provider returns matched
// numbers and a retained evidence artefact. No evidence, no pass."

export interface ScreeningResult {
  matched: string[]; // phone_e164 values the provider flagged
  evidencePath: string | null; // storage path to the retained artefact
  providerReference: string | null;
}

export interface ScreeningProvider {
  key: "internal" | "tps" | "ctps" | "us_national_dnc" | "state_dnc" | "manual_evidence";
  suppressionReason:
    | "internal_optout"
    | "tps"
    | "ctps"
    | "us_national_dnc"
    | "state_dnc";
  screen(phoneNumbers: string[]): Promise<ScreeningResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, missingEnvVars: string[]) {
    super(
      `${provider} is not configured — missing ${missingEnvVars.join(", ")}. ` +
        `Real bureau integration needs a live account (spec section 9); until then, use ManualEvidenceProvider.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}
