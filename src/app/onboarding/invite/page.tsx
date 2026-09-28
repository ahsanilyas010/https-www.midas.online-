import { STEP_LABEL } from "../steps";
import { InviteForm } from "./invite-form";

export default function OnboardingInvitePage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{STEP_LABEL.invite}</h1>
      <p className="mt-1 text-sm text-muted">Invite the people who&apos;ll work in your workspace.</p>
      <div className="mt-6">
        <InviteForm />
      </div>
    </div>
  );
}
