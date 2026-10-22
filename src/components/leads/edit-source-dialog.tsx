"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { updateDataSource, type ActionResult } from "@/lib/actions/data-sources";
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

const BASES = [
  { value: "consent", label: "Consent" },
  { value: "legitimate_interest", label: "Legitimate interest" },
  { value: "contract", label: "Contract" },
  { value: "not_personal_data", label: "Not personal data" },
];

const COMMON = COMMON_COUNTRY_CODES.map((c) => ISO_COUNTRIES.find((x) => x.value === c)).filter((x): x is NonNullable<typeof x> => Boolean(x));
const REST = ISO_COUNTRIES.filter((x) => !COMMON_COUNTRY_CODES.includes(x.value));

export type EditableSource = {
  id: string;
  name: string;
  source_type: string;
  lawful_basis: string;
  market: string | null;
  provider_url: string | null;
  notes: string | null;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
    </Button>
  );
}

// Edit a registered source. A source that came from before lawful bases were
// required starts with no basis chosen: saving a real one clears "Needs review".
export function EditSourceDialog({ source }: { source: EditableSource }) {
  const needsReview = source.lawful_basis === "unspecified";
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateDataSource, initialState);
  const [name, setName] = useState(source.name);
  const [type, setType] = useState(source.source_type);
  const [basis, setBasis] = useState(needsReview ? "" : source.lawful_basis);
  const [market, setMarket] = useState(source.market && ISO_COUNTRIES.some((c) => c.value === source.market) ? source.market : "");
  const router = useRouter();
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state.ok || handled.current === state) return;
    handled.current = state;
    setOpen(false);
    router.refresh();
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="sm"
        variant={needsReview ? undefined : "secondary"}
        aria-label={`${needsReview ? "Set lawful basis for" : "Edit"} ${source.name}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" /> {needsReview ? "Set basis" : "Edit"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{needsReview ? "Set the lawful basis" : "Edit data source"}</DialogTitle>
          <DialogDescription>
            {needsReview
              ? "This source holds leads uploaded before a lawful basis was required. Choose the basis that really applies, then it can be used for new imports."
              : "Changes apply to the source record. Leads already imported keep pointing at it."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={source.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`es_name_${source.id}`}>Name</Label>
            <Input id={`es_name_${source.id}`} name="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`es_type_${source.id}`}>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id={`es_type_${source.id}`}>
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
              <Label htmlFor={`es_basis_${source.id}`}>Lawful basis</Label>
              <Select value={basis} onValueChange={setBasis}>
                <SelectTrigger id={`es_basis_${source.id}`} aria-required="true">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`es_market_${source.id}`}>Market (optional)</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger id={`es_market_${source.id}`}>
                  <SelectValue placeholder={source.market ?? "Choose a country"} />
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
              <Label htmlFor={`es_url_${source.id}`}>Provider web address (optional)</Label>
              <Input id={`es_url_${source.id}`} name="provider_url" type="url" inputMode="url" defaultValue={source.provider_url ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`es_notes_${source.id}`}>Notes (optional)</Label>
            <Textarea id={`es_notes_${source.id}`} name="notes" rows={2} defaultValue={source.notes ?? ""} />
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
            <SubmitButton disabled={!name.trim() || !type || !basis} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
