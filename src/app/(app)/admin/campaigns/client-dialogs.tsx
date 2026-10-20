"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Pencil } from "lucide-react";
import {
  createClientRecord,
  updateClientRecord,
  type CreateClientResult,
} from "@/lib/actions/campaigns";
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

export interface ClientRow {
  id: string;
  name: string;
  country: string | null;
  contact_name: string | null;
  contact_email: string | null;
  is_data_controller: boolean;
  dpa_signed_on: string | null;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

function ClientFields({ client, prefix }: { client?: ClientRow; prefix: string }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}name`}>Legal entity name</Label>
        <Input id={`${prefix}name`} name="name" defaultValue={client?.name ?? ""} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}country`}>Country</Label>
          <Input id={`${prefix}country`} name="country" defaultValue={client?.country ?? ""} placeholder="United Kingdom" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${prefix}contact_name`}>Contact name</Label>
          <Input id={`${prefix}contact_name`} name="contact_name" defaultValue={client?.contact_name ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}contact_email`}>Client contact email</Label>
        <Input
          id={`${prefix}contact_email`}
          name="contact_email"
          type="email"
          defaultValue={client?.contact_email ?? ""}
          placeholder="contact@client.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}dpa`}>DPA signed on</Label>
        <Input id={`${prefix}dpa`} name="dpa_signed_on" type="date" defaultValue={client?.dpa_signed_on ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <Switch name="is_data_controller" defaultChecked={client?.is_data_controller ?? false} />
        Client is the data controller ({BRAND.processorLabel} is the processor)
      </label>
    </>
  );
}

export function CreateClientDialog({ label = "Add client", primary = false }: { label?: string; primary?: boolean }) {
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
      <Button variant={primary ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        <Building2 className="h-4 w-4" /> {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>
            Who is this campaign run for. Confirm data-controller status and get the DPA in writing before go-live.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          {open && <ClientFields prefix="new_client_" />}
          {state.error && <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton label="Add client" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
          <DialogDescription>Update the client&rsquo;s legal, contact and data-protection details.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={client.id} />
          {open && <ClientFields client={client} prefix={`edit_${client.id}_`} />}
          {state.error && <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton label="Save changes" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
