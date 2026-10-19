"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Ban } from "lucide-react";
import { addSuppressionEntry, type ActionResult } from "@/lib/actions/compliance";
import { SUPPRESSION_REASONS } from "@/lib/compliance/reasons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suppress"}
    </Button>
  );
}

export function AddSuppressionDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addSuppressionEntry, initialState);
  const [reason, setReason] = useState("internal_optout");
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" /> Suppress a number
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suppress a number</DialogTitle>
          <DialogDescription>
            Workspace-wide. The number is excluded from the dial queue the moment this saves.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" placeholder="+44 7700 900123" mono required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Default region</Label>
              <Input id="country" name="country" defaultValue="GB" maxLength={2} placeholder="GB / US" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPRESSION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="reason" value={reason} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea id="note" name="note" rows={2} />
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
