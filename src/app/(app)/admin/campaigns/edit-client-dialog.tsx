"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Pencil } from "lucide-react";
import { updateClientRecord, type CreateClientResult } from "@/lib/actions/campaigns";
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
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
    </Button>
  );
}

interface ClientRow {
  id: string;
  name: string;
  country: string | null;
  contact_email: string | null;
  is_data_controller: boolean;
}

export function EditClientDialog({ client }: { client: ClientRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateClientRecord, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Edit ${client.name}`}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            The contact email here is CC&rsquo;d on every email an agent sends to this
            client&rsquo;s leads.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={client.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit_client_name_${client.id}`}>Legal entity name</Label>
            <Input id={`edit_client_name_${client.id}`} name="name" defaultValue={client.name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit_country_${client.id}`}>Country</Label>
            <Input
              id={`edit_country_${client.id}`}
              name="country"
              defaultValue={client.country ?? ""}
              placeholder="United Kingdom"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit_contact_email_${client.id}`}>Client contact email</Label>
            <Input
              id={`edit_contact_email_${client.id}`}
              name="contact_email"
              type="email"
              defaultValue={client.contact_email ?? ""}
              placeholder="contact@client.com"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <Switch name="is_data_controller" defaultChecked={client.is_data_controller} />
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
