"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { createShift, type CreateShiftResult } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: CreateShiftResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create shift"}
    </Button>
  );
}

export function CreateShiftDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createShift, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New shift
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New shift</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift_name">Name</Label>
            <Input id="shift_name" name="name" placeholder="US Evening" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_time">Start time</Label>
              <Input id="start_time" name="start_time" type="time" defaultValue="09:00" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="end_time">End time</Label>
              <Input id="end_time" name="end_time" type="time" defaultValue="18:00" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue="Asia/Karachi" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grace_minutes">Grace (minutes)</Label>
              <Input id="grace_minutes" name="grace_minutes" type="number" defaultValue={10} />
            </div>
          </div>

          <AnimatePresence>
            {state.error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger"
              >
                {state.error}
              </motion.p>
            )}
          </AnimatePresence>

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
