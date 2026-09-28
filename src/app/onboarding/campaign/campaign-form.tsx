"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { createFirstCampaign, type OnboardingActionState } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
    </Button>
  );
}

export function CampaignForm() {
  const [state, action] = useActionState<OnboardingActionState, FormData>(createFirstCampaign, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" name="name" required placeholder="Spring outreach" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vertical">Vertical</Label>
          <Input id="vertical" name="vertical" placeholder="home_improvement" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="country">Country (2-letter)</Label>
          <Input id="country" name="country" maxLength={2} placeholder="US" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue="America/New_York" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
