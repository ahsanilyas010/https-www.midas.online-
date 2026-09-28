export const ONBOARDING_STEPS = ["brand", "campaign", "twilio", "data", "invite"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABEL: Record<OnboardingStep, string> = {
  brand: "Brand",
  campaign: "First campaign",
  twilio: "Connect Twilio",
  data: "Upload data",
  invite: "Invite your team",
};

export function isOnboardingStep(value: string | null): value is OnboardingStep {
  return Boolean(value) && (ONBOARDING_STEPS as readonly string[]).includes(value as string);
}

export function nextStepAfter(step: OnboardingStep): OnboardingStep | "done" {
  const i = ONBOARDING_STEPS.indexOf(step);
  return i === ONBOARDING_STEPS.length - 1 ? "done" : ONBOARDING_STEPS[i + 1];
}
