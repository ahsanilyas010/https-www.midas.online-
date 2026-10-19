"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { createCampaign, type CreateCampaignResult } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CampaignFormFields } from "./campaign-form";

const initialState: CreateCampaignResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create campaign"}
    </Button>
  );
}

export function CreateCampaignDialog({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCampaign, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.id) {
      setOpen(false);
      router.push(`/admin/campaigns/${state.id}`);
    }
  }, [state.ok, state.id, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" /> New campaign
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            One country per campaign. It starts paused: add agents and leads, then activate it to make it dialable.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <CampaignFormFields idPrefix="new_" clients={clients} />
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
