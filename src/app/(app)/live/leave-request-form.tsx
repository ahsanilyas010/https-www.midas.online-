"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestLeave, type LeaveActionState } from "@/lib/actions/attendance-v2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Request leave"}
    </Button>
  );
}

export function LeaveRequestForm() {
  const [state, action] = useActionState<LeaveActionState, FormData>(requestLeave, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="from_date" className="text-xs">
          From
        </Label>
        <Input id="from_date" name="from_date" type="date" required className="h-8 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="to_date" className="text-xs">
          To
        </Label>
        <Input id="to_date" name="to_date" type="date" required className="h-8 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="reason" className="text-xs">
          Reason
        </Label>
        <Input id="reason" name="reason" className="h-8 text-xs" placeholder="Optional" />
      </div>
      <SubmitButton />
      {state.ok && <span className="text-xs text-brand-green-text">Sent.</span>}
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
