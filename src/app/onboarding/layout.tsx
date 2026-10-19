import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { BrandMark } from "@/components/brand/mark";
import { BRAND } from "@/lib/brand";
import { ONBOARDING_STEPS, STEP_LABEL, normalizeStep } from "./steps";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin") redirect("/start");

  const workspace = await getCurrentWorkspace();
  // Already onboarded — this whole wizard is a one-time flow.
  if (workspace.status === "active") redirect("/start");

  const currentStep = normalizeStep(workspace.onboarding_step);
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <BrandMark size={30} />
          <span className="font-display text-lg font-semibold text-ink">{BRAND.productName}</span>
        </Link>

        <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium text-muted">
          {ONBOARDING_STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={
                  i < currentIndex
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-brand-green text-white"
                    : i === currentIndex
                      ? "flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue text-white"
                      : "flex h-6 w-6 items-center justify-center rounded-full bg-line text-muted"
                }
              >
                {i + 1}
              </span>
              <span className={i === currentIndex ? "text-ink" : ""}>{STEP_LABEL[step]}</span>
              {i < ONBOARDING_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden />}
            </li>
          ))}
        </ol>

        <div className="rounded-3xl bg-white p-6 shadow-xl shadow-brand-blue/5 ring-1 ring-line sm:p-8">{children}</div>
      </div>
    </div>
  );
}
