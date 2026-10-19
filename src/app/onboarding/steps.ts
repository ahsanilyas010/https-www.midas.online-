export const ONBOARDING_STEPS = ["brand", "campaign", "data", "invite"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABEL: Record<OnboardingStep, string> = {
  brand: "Brand",
  campaign: "First campaign",
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

// Workspaces that were mid-onboarding when the Twilio step was removed still
// have onboarding_step = 'twilio' stored; treat that as the next step.
export function normalizeStep(value: string | null): OnboardingStep {
  if (value === "twilio") return "data";
  return isOnboardingStep(value) ? value : "brand";
}
