"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { saveTwilioCredentials, type OnboardingActionState } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save and verify"}
    </Button>
  );
}

export function TwilioSettingsForm() {
  const [state, action] = useActionState<OnboardingActionState, FormData>(saveTwilioCredentials, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account_sid">Account SID</Label>
        <Input id="account_sid" name="account_sid" required placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth_token">Auth Token</Label>
        <Input id="auth_token" name="auth_token" type="password" required placeholder="Your Twilio Auth Token" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand-green-text">Connected and verified.</p>}
      <SubmitButton />
    </form>
  );
}
