"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { recommendedStep, type SetupStep } from "@/lib/guide/checklist";

// The list of setup steps, shared by the dashboard card and the header
// dialog. Every step expands to show why it matters and a button to do it; the
// recommended next step starts expanded and highlighted.
export function SetupChecklist({ steps, onNavigate }: { steps: SetupStep[]; onNavigate?: () => void }) {
  const next = recommendedStep(steps);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <ol className="flex flex-col gap-2" data-testid="setup-checklist">
      {steps.map((step, i) => {
        const isNext = next?.id === step.id;
        const expanded = open[step.id] ?? isNext;
        return (
          <li
            key={step.id}
            data-testid={`setup-step-${step.id}`}
            data-done={step.done}
            data-next={isNext}
            className={cn(
              "rounded-xl border bg-white transition-colors",
              isNext ? "border-brand-blue/60 ring-2 ring-brand-blue/15" : "border-line",
              step.done && "bg-canvas/60",
            )}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [step.id]: !expanded }))}
              aria-expanded={expanded}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-brand-green text-ink" : isNext ? "bg-brand-blue text-white" : "border border-line text-muted",
                )}
                aria-hidden
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("text-sm font-medium", step.done ? "text-muted line-through decoration-muted/50" : "text-ink")}>{step.title}</span>
                {step.optional && <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">Optional</span>}
                <span className="sr-only">{step.done ? " (done)" : " (not done)"}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
            {expanded && (
              <div className="flex flex-col gap-3 px-3 pb-3 pl-12 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">{step.why}</p>
                <Link
                  href={step.href}
                  onClick={onNavigate}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold",
                    step.done ? "border border-line bg-white text-ink hover:bg-canvas" : "bg-brand-blue text-white hover:brightness-110",
                  )}
                >
                  {step.done ? "Review" : step.cta}
                </Link>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
