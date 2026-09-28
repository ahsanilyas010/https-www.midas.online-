import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { isOnboardingStep } from "./steps";

export default async function OnboardingIndexPage() {
  const workspace = await getCurrentWorkspace();
  const step = isOnboardingStep(workspace.onboarding_step) ? workspace.onboarding_step : "brand";
  redirect(`/onboarding/${step}`);
}
