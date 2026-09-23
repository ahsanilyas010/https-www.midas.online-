"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Building2 } from "lucide-react";
import { createClientRecord, type CreateClientResult } from "@/lib/actions/campaigns";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: CreateClientResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add client"}
    </Button>
  );
}

export function CreateClientDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createClientRecord, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Building2 className="h-4 w-4" /> Add client
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>
            Who is this campaign run for. Confirm data-controller status and get the DPA in
            writing before go-live.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client_name">Legal entity name</Label>
            <Input id="client_name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" placeholder="United Kingdom" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact_email">Client contact email</Label>
            <Input id="contact_email" name="contact_email" type="email" placeholder="contact@client.com" />
            <p className="text-[11px] text-muted">
              CC&rsquo;d on every email an agent sends to this client&rsquo;s leads. Leave blank to
              skip.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch name="is_data_controller" />
            Client is the data controller ({BRAND.processorLabel} is the processor)
          </label>

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
