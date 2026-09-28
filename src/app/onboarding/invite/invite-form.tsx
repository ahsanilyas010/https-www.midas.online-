"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { inviteMember, finishOnboarding, type OnboardingActionState } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function SendInviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
    </Button>
  );
}

export function InviteForm() {
  const [state, action] = useActionState<OnboardingActionState, FormData>(inviteMember, {});
  const [finishing, startFinish] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Name</Label>
            <Input id="full_name" name="full_name" required placeholder="Jordan Smith" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="jordan@company.com" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Select name="role" defaultValue="agent">
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="team_lead">Team lead</SelectItem>
              <SelectItem value="ops_manager">Ops manager</SelectItem>
              <SelectItem value="qa_analyst">QA analyst</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {state.ok && <p className="text-sm text-brand-green-text">Invite sent.</p>}
        <SendInviteButton />
      </form>

      <div className="border-t border-line pt-5">
        <Button
          type="button"
          disabled={finishing}
          onClick={() =>
            startFinish(async () => {
              await finishOnboarding();
              router.push("/start");
            })
          }
        >
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish setup"}
        </Button>
        <p className="mt-2 text-xs text-muted">You can always invite more people later from People.</p>
      </div>
    </div>
  );
}
