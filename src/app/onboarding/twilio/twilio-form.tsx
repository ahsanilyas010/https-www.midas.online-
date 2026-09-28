"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveTwilioCredentials, skipTwilioStep, type OnboardingActionState } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save and continue"}
    </Button>
  );
}

export function TwilioForm() {
  const [state, action] = useActionState<OnboardingActionState, FormData>(saveTwilioCredentials, {});
  const [skipping, startSkip] = useTransition();
  const router = useRouter();

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account_sid">Twilio Account SID</Label>
        <Input id="account_sid" name="account_sid" required placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth_token">Twilio Auth Token</Label>
        <Input id="auth_token" name="auth_token" type="password" required placeholder="Your Twilio Auth Token" />
      </div>
      <p className="text-xs text-muted">
        We&apos;ll store this securely. Verifying the connection and enabling the Call button happens in a later
        setup step.
      </p>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          disabled={skipping}
          onClick={() =>
            startSkip(async () => {
              await skipTwilioStep();
              router.push("/onboarding/data");
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
