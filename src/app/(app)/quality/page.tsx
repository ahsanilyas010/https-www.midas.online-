import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getQaQueue, getMyQaScores } from "@/lib/actions/qa-v2";
import { QaScoringClient } from "./qa-scoring-client";
import { MyScoresClient } from "./my-scores-client";

export const metadata: Metadata = { title: "Quality", robots: { index: false, follow: false } };

// Real-workspace QA (Phase 6). QA analysts/managers score calls against a
// weighted, fatal-error-aware scorecard (record_call_attempt() already
// stores which disposition a call ended in; scoring happens after);
// agents see and acknowledge their own scores. Separate from the legacy
// demo /qa page.
export default async function QualityPage() {
  const profile = await requireRealProfile();

  if (["super_admin", "ops_manager", "qa_analyst"].includes(profile.role)) {
    const { template, criteria, queue } = await getQaQueue();
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-display text-2xl font-semibold text-ink">QA queue</h1>
        <p className="mt-1 text-sm text-muted">Scoring against &ldquo;{template.name}&rdquo;.</p>
        <div className="mt-6">
          <QaScoringClient template={template} criteria={criteria} queue={queue} />
        </div>
      </div>
    );
  }

  if (profile.role === "agent") {
    const scores = await getMyQaScores();
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-display text-2xl font-semibold text-ink">My QA scores</h1>
        <div className="mt-6">
          <MyScoresClient scores={scores} />
        </div>
      </div>
    );
  }

  redirect("/start");
}
