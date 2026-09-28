import { STEP_LABEL } from "../steps";
import { CampaignForm } from "./campaign-form";

export default function OnboardingCampaignPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{STEP_LABEL.campaign}</h1>
      <p className="mt-1 text-sm text-muted">
        Set up your first campaign. You can add calling windows, scripts and compliance details later.
      </p>
      <div className="mt-6">
        <CampaignForm />
      </div>
    </div>
  );
}
