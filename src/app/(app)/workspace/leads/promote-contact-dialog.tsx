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
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to dial queue"}
    </Button>
  );
}

interface PromotableContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  project_title: string | null;
  role: string | null;
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

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "This contact";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Phone className="h-3.5 w-3.5" /> Add number
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a phone number</DialogTitle>
          <DialogDescription>
            {name} came from a contacts export with no phone number. Once you add one, they move
            into your dial queue like any other lead.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="contact_id" value={contact.id} />

          <div className="rounded-md bg-canvas px-3 py-2 text-xs text-muted">
            {contact.project_title && <div className="font-medium text-ink">{contact.project_title}</div>}
            {contact.role && <div>{contact.role}</div>}
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
