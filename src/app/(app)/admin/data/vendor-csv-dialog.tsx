"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { importVendorFile, type ActionResult } from "@/lib/actions/data-sources";
import { marketToCountryHint } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const initialState: ActionResult = {};
const NONE = "__none__";

const FIELDS: { key: string; label: string; required?: boolean; guess: RegExp }[] = [
  { key: "map_phone", label: "Phone", required: true, guess: /phone|mobile|cell|tel|msisdn/i },
  { key: "map_name", label: "Full name", guess: /^(full[ _]?)?name$|contact[ _]?name/i },
  { key: "map_first_name", label: "First name", guess: /first/i },
  { key: "map_last_name", label: "Last name", guess: /last|surname/i },
  { key: "map_email", label: "Email", guess: /e-?mail/i },
  { key: "map_external_ref", label: "External reference", guess: /^(ref|reference|id|sr|serial)/i },
];

function guess(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of FIELDS) {
    const h = headers.find((x) => !used.has(x) && f.guess.test(x.trim()));
    if (h) {
      out[f.key] = h;
      used.add(h);
    }
  }
  return out;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
    </Button>
  );
}

export function VendorCsvDialog({
  campaigns,
  dataSources,
}: {
  campaigns: { id: string; name: string; country: string | null }[];
  dataSources: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(importVendorFile, initialState);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [campaignId, setCampaignId] = useState(NONE);
  const [dataSourceId, setDataSourceId] = useState(dataSources[0]?.id ?? "");
  const [country, setCountry] = useState("GB");
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      toast.success(
        `Imported ${state.imported ?? 0} lead(s), ${state.rejected ?? 0} rejected, ${state.unphoned ?? 0} phone-less contact(s) held.`,
      );
      setOpen(false);
      setHeaders([]);
      setMapping({});
      router.refresh();
    }
  }, [state, router]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const h = rows.length > 0 ? Object.keys(rows[0]) : [];
    setHeaders(h);
    setMapping(guess(h));
  }

  const noSources = dataSources.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" /> Import vendor file
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import vendor CSV / XLSX</DialogTitle>
          <DialogDescription>
            Creates a lead batch tagged with the source. Numbers already on file or on the suppression list are
            skipped; rows with no phone are held as contacts to be promoted later. Imported leads are pending until
            the batch is screened.
          </DialogDescription>
        </DialogHeader>

        {noSources ? (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-xs text-warning">Register a data source first.</p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Data source</Label>
                <Select value={dataSourceId} onValueChange={setDataSourceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="data_source_id" value={dataSourceId} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Campaign (optional)</Label>
                <Select
                  value={campaignId}
                  onValueChange={(v) => {
                    setCampaignId(v);
                    const c = campaigns.find((x) => x.id === v);
                    if (c) setCountry(c.country?.length === 2 ? c.country.toUpperCase() : marketToCountryHint(c.country));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="campaign_id" value={campaignId === NONE ? "" : campaignId} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vc_country">Default phone region (ISO, e.g. GB, US, PK)</Label>
              <Input id="vc_country" name="country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vc_file">File (.csv, .xlsx)</Label>
              <Input id="vc_file" name="file" type="file" accept=".csv,.xlsx,.xls" required onChange={onFileChange} />
            </div>

            {headers.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label>
                      {f.label}
                      {f.required && " *"}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? NONE}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === NONE ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name={f.key} value={mapping[f.key] ?? ""} />
                  </div>
                ))}
              </div>
            )}

            {state.error && <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{state.error}</p>}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton disabled={headers.length === 0 || !mapping.map_phone} />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
