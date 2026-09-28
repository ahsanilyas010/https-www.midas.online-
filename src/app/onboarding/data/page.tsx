import { STEP_LABEL } from "../steps";
import { DataForm } from "./data-form";

export default function OnboardingDataPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{STEP_LABEL.data}</h1>
      <p className="mt-1 text-sm text-muted">Upload your first batch of leads to get started.</p>
      <div className="mt-6">
        <DataForm />
      </div>
    </div>
  );
}
