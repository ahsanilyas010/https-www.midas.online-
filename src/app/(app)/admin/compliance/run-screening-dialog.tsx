"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { screenBatch, type ActionResult } from "@/lib/actions/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark screened"}
    </Button>
  );
}

export function RunScreeningDialog({
  batchId,
  label,
  pending = 0,
  screenedBefore = false,
}: {
  batchId: string;
  label: string;
  pending?: number; // leads in this batch still waiting
  screenedBefore?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(screenBatch, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      toast.success(`${state.screened ?? 0} lead(s) marked as passed.`);
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, state.screened, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={pending > 0 ? "primary" : "secondary"} onClick={() => setOpen(true)} data-testid="screen-batch">
        <ShieldCheck className="h-3.5 w-3.5" />
        {!screenedBefore ? "Screen" : pending > 0 ? `Screen ${pending} pending` : "Screen again"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Screen batch</DialogTitle>
          <DialogDescription>
            {label}.{" "}
            {pending > 0
              ? `${pending} lead${pending === 1 ? "" : "s"} in this batch ${pending === 1 ? "is" : "are"} waiting to be screened. `
              : screenedBefore
                ? "Every lead in this batch has already been screened; running it again only updates the screening date and lets you attach evidence. "
                : ""}
            This records the screening and stamps the batch&rsquo;s pending leads as passed. It does not
            query TPS, CTPS or the National DNC registry: run that check with your bureau first and attach its
            response as evidence. Numbers on the suppression list stay undialable regardless.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="batch_id" value={batchId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`evidence-${batchId}`}>Bureau response / evidence file (optional)</Label>
            <Input id={`evidence-${batchId}`} name="evidence" type="file" />
          </div>
          {state.error && <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
