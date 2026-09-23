"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Pencil } from "lucide-react";
import { updateAssignedLead, type ActionResult } from "@/lib/actions/my-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
    </Button>
  );
}

interface EditableLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_e164: string;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  custom: unknown;
}

export function EditLeadDialog({ lead }: { lead: EditableLead }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateAssignedLead, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  const custom = (lead.custom as Record<string, unknown> | null) ?? {};
  const agentNotes = typeof custom.agent_notes === "string" ? custom.agent_notes : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Edit lead">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>
            Changes save straight to this lead. &ldquo;My notes&rdquo; is yours alone — it
            doesn&rsquo;t touch the imported source history.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="lead_id" value={lead.id} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" defaultValue={lead.first_name ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" defaultValue={lead.last_name ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_name">Company</Label>
            <Input id="company_name" name="company_name" defaultValue={lead.company_name ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" mono defaultValue={lead.phone_raw ?? lead.phone_e164} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={lead.email ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_line1">Address</Label>
            <Input id="address_line1" name="address_line1" defaultValue={lead.address_line1 ?? ""} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={lead.city ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region">County / state</Label>
              <Input id="region" name="region" defaultValue={lead.region ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="postcode">Postcode</Label>
              <Input id="postcode" name="postcode" defaultValue={lead.postcode ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent_notes">My notes</Label>
            <Textarea id="agent_notes" name="agent_notes" rows={3} defaultValue={agentNotes} />
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
