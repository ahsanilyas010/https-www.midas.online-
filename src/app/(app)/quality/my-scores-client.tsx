"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeQaScore } from "@/lib/actions/qa-v2";
import type { RealTables } from "@/lib/supabase/real-types";

export function MyScoresClient({ scores }: { scores: RealTables<"qa_scores">[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {scores.map((s) => (
        <div key={s.id} className="rounded-xl border border-line bg-white p-4 text-sm shadow-sm">
          <div className="flex items-center justify-between">
            <span className={`font-semibold ${s.passed ? "text-brand-green-text" : "text-danger"}`}>
              {s.total_score}% {s.passed ? "Passed" : "Failed"} {s.fatal_breach && "(fatal)"}
            </span>
            <span className="text-xs text-muted">{new Date(s.created_at).toLocaleDateString()}</span>
          </div>
          {s.coaching_notes && <p className="mt-2 text-muted">{s.coaching_notes}</p>}
          {s.acknowledged_at ? (
            <p className="mt-2 text-xs text-muted">Acknowledged {new Date(s.acknowledged_at).toLocaleDateString()}</p>
          ) : (
            <button
              disabled={pending}
              onClick={() => startTransition(async () => { await acknowledgeQaScore(s.id); router.refresh(); })}
              className="mt-2 text-xs font-semibold text-brand-blue hover:underline disabled:opacity-60"
            >
              Acknowledge
            </button>
          )}
        </div>
      ))}
      {scores.length === 0 && <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-muted">No QA scores yet.</p>}
    </div>
  );
}
