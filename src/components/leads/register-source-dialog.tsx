"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { registerDataSource, type ActionResult } from "@/lib/actions/data-sources";
import { COMMON_COUNTRY_CODES, ISO_COUNTRIES } from "@/lib/countries";
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

// The basis is recorded against every list, so it is never preselected: the
// person registering the source has to decide, and the one-line meaning helps.
const BASES = [
  { value: "consent", label: "Consent", help: "The people agreed to be contacted." },
  { value: "legitimate_interest", label: "Legitimate interest", help: "You have a documented business reason to contact them." },
  { value: "contract", label: "Contract", help: "You need to contact them to perform a contract." },
  { value: "not_personal_data", label: "Not personal data", help: "The list holds no information about individuals." },
];

// Frequently used markets first, then everything else alphabetically.
const COMMON = COMMON_COUNTRY_CODES.map((c) => ISO_COUNTRIES.find((x) => x.value === c)).filter((x): x is NonNullable<typeof x> => Boolean(x));
const REST = ISO_COUNTRIES.filter((x) => !COMMON_COUNTRY_CODES.includes(x.value));

function Required() {
  return (
    <span aria-hidden className="ml-0.5 text-danger">
      *
    </span>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register source"}
    </Button>
  );
}

// Registers a data source (where a list came from, and the lawful basis it is
// held under). Used on Data and inside the importer, where `onCreated` selects
// the new source straight away.
export function RegisterSourceDialog({
  onCreated,
  label = "Register source",
  variant = "primary",
}: {
  onCreated?: (id: string) => void;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(registerDataSource, initialState);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [basis, setBasis] = useState("");
  const [market, setMarket] = useState("");
  const router = useRouter();
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state.ok || handled.current === state) return;
    handled.current = state;
    setOpen(false);
    setName("");
    setType("");
    setBasis("");
    setMarket("");
    if (state.id) onCreated?.(state.id);
    router.refresh();
  }, [state, onCreated, router]);

  const chosenBasis = BASES.find((b) => b.value === basis);
  const incomplete = !name.trim() || !type || !basis;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" variant={variant === "secondary" ? "secondary" : undefined} onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a data source</DialogTitle>
          <DialogDescription>
            Every list is imported from a source, with the lawful basis it is held under on file. Fields marked <span aria-hidden>*</span> are required.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds_name">
              Name
              <Required />
            </Label>
            <Input
              id="ds_name"
              name="name"
              placeholder="e.g. Acme Data Ltd, Q4 list"
              required
              aria-required="true"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds_type">
                Type
                <Required />
              </Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="ds_type" aria-required="true">
                  <SelectValue placeholder="Choose a type" />
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
              <Label htmlFor="ds_basis">
                Lawful basis
                <Required />
              </Label>
              <Select value={basis} onValueChange={setBasis}>
                <SelectTrigger id="ds_basis" aria-required="true" aria-describedby="ds_basis_help">
                  <SelectValue placeholder="Choose a basis" />
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
          <p id="ds_basis_help" className="-mt-1 text-xs text-muted">
            {chosenBasis ? chosenBasis.help : "There is no default: choose the basis that really applies to this list."}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds_market">Market (optional)</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger id="ds_market">
                  <SelectValue placeholder="Choose a country" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON.map((c) => (
                    <SelectItem key={`c-${c.value}`} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                  {REST.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="market" value={market} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ds_url">Provider web address (optional)</Label>
              <Input id="ds_url" name="provider_url" type="url" inputMode="url" placeholder="https://example.com" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds_notes">Notes (optional)</Label>
            <Textarea id="ds_notes" name="notes" rows={2} />
          </div>
          {state.error && (
            <p role="alert" className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton disabled={incomplete} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
