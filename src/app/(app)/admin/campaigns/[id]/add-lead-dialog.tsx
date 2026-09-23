"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, UserPlus } from "lucide-react";
import { createManualLead, type ActionResult } from "@/lib/actions/leads";
import { marketToCountryHint } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CreateDataSourceDialog } from "./create-data-source-dialog";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add lead"}
    </Button>
  );
}

export function AddLeadDialog({
  campaignId,
  campaignMarket,
  dataSources,
}: {
  campaignId: string;
  campaignMarket: string | null;
  dataSources: { id: string; name: string; lawful_basis: string }[];
}) {
  const defaultCountry = marketToCountryHint(campaignMarket);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createManualLead, initialState);
  const [dataSourceId, setDataSourceId] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add lead
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>
            Provenance is mandatory and can&rsquo;t be skipped — every lead traces back to a data
            source with a lawful basis on file.
          </DialogDescription>
        </DialogHeader>

        {dataSources.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line p-6 text-center">
            <p className="text-sm text-muted">
              No data sources yet. You need at least one before a lead can be entered.
            </p>
            <CreateDataSourceDialog />
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="campaign_id" value={campaignId} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="data_source_id">Data source</Label>
              <Select value={dataSourceId} onValueChange={setDataSourceId}>
                <SelectTrigger id="data_source_id">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {dataSources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.lawful_basis.replace(/_/g, " ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="data_source_id" value={dataSourceId} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" name="last_name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" placeholder="+44 7700 900123" mono required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="country">Region</Label>
                <Input id="country" name="country" defaultValue={defaultCountry} placeholder="GB / US / PK" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="region">County / state</Label>
                <Input id="region" name="region" />
              </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
