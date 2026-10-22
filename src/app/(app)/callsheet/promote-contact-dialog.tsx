"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Phone } from "lucide-react";
import { promoteContact, type ActionResult } from "@/lib/actions/promote-contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to my leads"}
    </Button>
  );
}

interface PromotableContact {
  id: string;
  full_name: string | null;
  company_name: string | null;
  country_hint: string;
}

export function PromoteContactDialog({ contact }: { contact: PromotableContact }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(promoteContact, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  const name = contact.full_name || "This contact";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Phone className="h-3.5 w-3.5" /> Add number
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a phone number</DialogTitle>
          <DialogDescription>
            {name} has no phone number on file. Once you add one it is checked against the suppression
            list and they join your lead list; a manager screens it before it can be dialed.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="contact_id" value={contact.id} />

          <div className="rounded-md bg-canvas px-3 py-2 text-xs text-muted">
            {contact.full_name && <div className="font-medium text-ink">{contact.full_name}</div>}
            {contact.company_name && <div>{contact.company_name}</div>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" name="phone" mono placeholder="e.g. 020 7946 0958" autoFocus />
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
