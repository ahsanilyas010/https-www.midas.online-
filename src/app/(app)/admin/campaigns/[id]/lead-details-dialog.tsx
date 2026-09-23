"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { CUSTOM_FIELD_LABELS } from "@/lib/lead-custom-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ContactDetails {
  email?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  address_line1?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
}

export function LeadDetailsDialog({
  leadName,
  custom,
  contact,
}: {
  leadName: string;
  custom: Record<string, unknown> | null;
  contact?: ContactDetails;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(custom ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");

  const contactRows: { label: string; value: string }[] = [];
  if (contact?.email) contactRows.push({ label: "Email", value: contact.email });
  if (contact?.company_name || contact?.job_title) {
    contactRows.push({
      label: "Company",
      value: [contact.company_name, contact.job_title].filter(Boolean).join(" — "),
    });
  }
  const address = [contact?.address_line1, contact?.city, contact?.region, contact?.postcode]
    .filter(Boolean)
    .join(", ");
  if (address) contactRows.push({ label: "Address", value: address });

  if (entries.length === 0 && contactRows.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Details for ${leadName}`}>
        <Info className="h-3.5 w-3.5" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leadName}</DialogTitle>
          <DialogDescription>
            Contact details plus any extra context carried over from the source file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          {contactRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{row.label}</span>
              <span className="text-sm text-ink">{row.value}</span>
            </div>
          ))}
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {CUSTOM_FIELD_LABELS[key] ?? key}
              </span>
              <span className="text-sm text-ink">{String(value)}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
