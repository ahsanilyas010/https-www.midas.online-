import { STEP_LABEL } from "../steps";
import { TwilioForm } from "./twilio-form";

export default function OnboardingTwilioPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{STEP_LABEL.twilio}</h1>
      <p className="mt-1 text-sm text-muted">
        Connect the Twilio account your team will dial from. Call minutes bill to your own Twilio account, never
        ours.
      </p>
      <div className="mt-6">
        <TwilioForm />
      </div>
    </div>
  );
}
