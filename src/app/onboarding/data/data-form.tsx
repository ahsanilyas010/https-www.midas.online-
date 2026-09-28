"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { uploadFirstLeadBatch, skipDataStep, type OnboardingActionState } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload and continue"}
    </Button>
  );
}

export function DataForm() {
  const [state, action] = useActionState<OnboardingActionState, FormData>(uploadFirstLeadBatch, {});
  const [skipping, startSkip] = useTransition();
  const router = useRouter();

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">Lead list (CSV)</Label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" required className="text-sm text-ink" />
      </div>
      <p className="text-xs text-muted">
        We just store the file for now — column mapping, dedupe and TPS/DNC screening arrive in a later setup step.
      </p>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          disabled={skipping}
          onClick={() =>
            startSkip(async () => {
              await skipDataStep();
              router.push("/onboarding/invite");
            })
          }
          className="text-sm font-medium text-muted hover:text-ink disabled:opacity-60"
        >
          {skipping ? "Skipping..." : "Skip for now"}
        </button>
      </div>
    </form>
  );
}
