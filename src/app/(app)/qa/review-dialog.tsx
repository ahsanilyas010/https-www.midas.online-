"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { submitQaReview, type CallForReview, type ScorecardCriterion } from "@/lib/actions/qa";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Scorecard {
  id: string;
  name: string;
  criteria: unknown;
  pass_threshold: number;
}

export function ReviewDialog({ call, scorecard }: { call: CallForReview; scorecard: Scorecard }) {
  const [open, setOpen] = useState(false);
  const criteria = scorecard.criteria as ScorecardCriterion[];
  const [met, setMet] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const fatalFailed = criteria.some((c) => c.is_fatal && !met[c.key]);

  function submit() {
    const scores = Object.fromEntries(
      criteria.map((c) => [c.key, met[c.key] ? c.max_score : 0]),
    );

    startTransition(async () => {
      const result = await submitQaReview({
        callAttemptId: call.id,
        agentId: call.agent_id,
        scorecardId: scorecard.id,
        scores,
        criteria,
        passThreshold: scorecard.pass_threshold,
        coachingNotes: notes,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Review submitted");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ClipboardCheck className="h-3.5 w-3.5" /> Review
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QA review — {scorecard.name}</DialogTitle>
          <DialogDescription>
            {call.profiles?.full_name} ·{" "}
            {[call.leads?.first_name, call.leads?.last_name].filter(Boolean).join(" ") ||
              call.leads?.phone_e164}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          {criteria.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={met[c.key] ?? false}
                onCheckedChange={(v) => setMet((m) => ({ ...m, [c.key]: v === true }))}
                className="mt-0.5"
              />
              <span>
                {c.label}
                {c.is_fatal && <span className="ml-1 text-[10px] text-danger">FATAL</span>}
              </span>
            </label>
          ))}
        </div>

        {fatalFailed && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">
            <ShieldAlert className="h-3.5 w-3.5" /> A fatal criterion is unmet — this review will
            fail regardless of overall score.
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1.5">
          <Textarea
            placeholder="Coaching notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
