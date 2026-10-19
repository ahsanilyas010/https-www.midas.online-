"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { registerDataSource, type ActionResult } from "@/lib/actions/data-sources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const initialState: ActionResult = {};

const SOURCE_TYPES = [
  { value: "vendor_licensed", label: "Licensed vendor" },
  { value: "client_supplied", label: "Client supplied" },
  { value: "public_open_data", label: "Public / open data" },
  { value: "inbound_web_form", label: "Inbound web form" },
  { value: "referral", label: "Referral" },
  { value: "manual_entry", label: "Manual entry" },
];
const BASES = [
  { value: "legitimate_interest", label: "Legitimate interest" },
  { value: "consent", label: "Consent" },
  { value: "contract", label: "Contract" },
  { value: "not_personal_data", label: "Not personal data" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register source"}
    </Button>
  );
}

export function RegisterSourceDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(registerDataSource, initialState);
  const [type, setType] = useState("vendor_licensed");
  const [basis, setBasis] = useState("legitimate_interest");
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
        <Plus className="h-3.5 w-3.5" /> Register source
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a data source</DialogTitle>
          <DialogDescription>
            Every lead traces back to a source with a lawful basis on file. Leads cannot be imported without one.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds_name">Name</Label>
            <Input id="ds_name" name="name" placeholder="Acme Data Ltd, Q4 list" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="source_type" value={type} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Lawful basis</Label>
              <Select value={basis} onValueChange={setBasis}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="lawful_basis" value={basis} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds_market">Market</Label>
              <Input id="ds_market" name="market" placeholder="UK / US / PK" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds_url">Provider URL</Label>
              <Input id="ds_url" name="provider_url" placeholder="https://" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds_notes">Notes</Label>
            <Textarea id="ds_notes" name="notes" rows={2} />
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
