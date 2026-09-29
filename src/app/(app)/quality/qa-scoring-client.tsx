"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQaScore, type QaQueueItem } from "@/lib/actions/qa-v2";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RealTables } from "@/lib/supabase/real-types";

export function QaScoringClient({
  template,
  criteria,
  queue,
}: {
  template: RealTables<"qa_templates">;
  criteria: RealTables<"qa_criteria">[];
  queue: QaQueueItem[];
}) {
  const [selected, setSelected] = useState<QaQueueItem | null>(null);
  const [met, setMet] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!selected) {
    return (
      <div className="flex flex-col gap-2">
        {queue.map((item) => (
          <button
            key={item.call.id}
            onClick={() => {
              setSelected(item);
              setMet({});
              setNotes("");
            }}
            className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-left text-sm shadow-sm hover:border-brand-blue-tint-2"
          >
            <span>
              <span className="font-medium text-ink">{item.agentName ?? "Unknown agent"}</span>
              <span className="ml-2 text-muted">→ {item.leadName ?? "Unknown lead"}</span>
            </span>
            <span className="text-xs text-muted">{new Date(item.call.created_at).toLocaleString()}</span>
          </button>
        ))}
        {queue.length === 0 && <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-muted">Nothing to score right now.</p>}
      </div>
    );
  }

  async function submit() {
    const results = criteria.map((c) => ({ criterionId: c.id, met: met[c.id] ?? false, weight: c.weight, isFatal: c.is_fatal }));
    setError(null);
    startTransition(async () => {
      const res = await submitQaScore({
        callId: selected!.call.id,
        agentId: selected!.call.agent_id,
        templateId: template.id,
        results,
        coachingNotes: notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSelected(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setSelected(null)} className="self-start text-sm text-brand-blue hover:underline">
        ← Back to queue
      </button>
      <div className="rounded-xl border border-line bg-white p-4 text-sm">
        <div className="font-medium text-ink">{selected.agentName}</div>
        <div className="text-muted">Lead: {selected.leadName}</div>
        {selected.call.recording_path && <div className="mt-1 text-xs text-muted">Recording on file — retrieved by an admin from Storage.</div>}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        {criteria.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
            <span className="text-ink">
              {c.label} {c.is_fatal && <span className="ml-1 rounded bg-danger-tint px-1.5 py-0.5 text-[10px] font-semibold text-danger">FATAL</span>}
            </span>
            <input type="checkbox" checked={met[c.id] ?? false} onChange={(e) => setMet((prev) => ({ ...prev, [c.id]: e.target.checked }))} className="h-4 w-4" />
          </label>
        ))}
      </div>

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Coaching notes for the agent" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={submit} disabled={pending} className="self-end">
        {pending ? "Saving..." : "Submit score"}
      </Button>
    </div>
  );
}
