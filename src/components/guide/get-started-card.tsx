"use client";

import Link from "next/link";
import { CheckCircle2, EyeOff, PlayCircle } from "lucide-react";
import { useGuide } from "@/components/guide/guide-provider";
import { SetupChecklist } from "@/components/guide/setup-checklist";
import { recommendedStep } from "@/lib/guide/checklist";

// The "Get started" card at the top of the manager dashboard. Reads the same
// progress as the header's Setup guide button; "Hide" is remembered per user.
export function GetStartedCard() {
  const guide = useGuide();
  if (!guide || !guide.steps || guide.checklistHidden) return null;

  const { steps, done, total } = guide;
  const next = recommendedStep(steps);
  const pct = Math.round((done / total) * 100);

  return (
    <section
      aria-label="Get started"
      data-testid="get-started-card"
      className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{next ? "Get started" : "You're all set"}</h2>
          <p className="mt-0.5 text-sm text-muted" data-testid="get-started-count">
            {next ? (
              <>
                <span className="font-medium text-ink">{done} of {total}</span> steps done. Next up: {next.title}.
              </>
            ) : (
              "Everything is set up. Your team is ready to call."
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {guide.hasTour && (
            <button
              type="button"
              onClick={guide.startTour}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink hover:bg-canvas"
            >
              <PlayCircle className="h-4 w-4" /> Take the tour
            </button>
          )}
          <button
            type="button"
            onClick={guide.hideChecklist}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-canvas hover:text-ink"
          >
            <EyeOff className="h-4 w-4" /> Hide
          </button>
        </div>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Setup progress"
      >
        <div className="h-full rounded-full bg-brand-blue transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {next ? (
        <div className="mt-4">
          <SetupChecklist steps={steps} />
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink">
          <CheckCircle2 className="h-4 w-4 text-brand-green-text" /> All {total} steps complete.{" "}
          <Link href="/admin/campaigns" className="font-medium text-brand-blue hover:underline">
            Go to campaigns
          </Link>
        </p>
      )}
    </section>
  );
}
