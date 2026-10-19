import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { normalizeStep } from "./steps";

export default async function OnboardingIndexPage() {
  const workspace = await getCurrentWorkspace();
  const step = normalizeStep(workspace.onboarding_step);
  redirect(`/onboarding/${step}`);
}
