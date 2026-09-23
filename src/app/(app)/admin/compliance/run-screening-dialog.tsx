"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { runInternalScreening, uploadManualScreeningEvidence, type ActionResult } from "@/lib/actions/screening";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const initialState: ActionResult = {};
const PROVIDERS = [
  { value: "TPS", label: "TPS (UK)" },
  { value: "CTPS", label: "CTPS (UK)" },
  { value: "US_NATIONAL_DNC", label: "US National DNC" },
  { value: "STATE_DNC", label: "US State DNC" },
];

function ManualSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply evidence"}
    </Button>
  );
}

export function RunScreeningDialog({ campaigns }: { campaigns: { id: string; name: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [provider, setProvider] = useState(PROVIDERS[0].value);
  const [phoneColumn, setPhoneColumn] = useState("phone");
  const [internalPending, startInternal] = useTransition();
  const [manualState, manualAction] = useActionState(uploadManualScreeningEvidence, initialState);
  const router = useRouter();

  useEffect(() => {
    if (manualState.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [manualState.ok, router]);

  function runInternal() {
    if (!campaignId) return;
    startInternal(async () => {
      const result = await runInternalScreening(campaignId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Screened ${result.screened} — ${result.matched} matched and suppressed.`);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-3.5 w-3.5" /> Run screening
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run screening</DialogTitle>
          <DialogDescription>
            Screens every unscreened/expired lead in the chosen campaign. Matches go straight onto
            the suppression list and are blocked immediately — every run is logged, evidence
            included.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Campaign</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="internal" className="mt-2">
          <TabsList>
            <TabsTrigger value="internal">Internal (always available)</TabsTrigger>
            <TabsTrigger value="manual">Bureau evidence upload</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="pt-3">
            <p className="mb-3 text-xs text-muted">
              Checks every unscreened/expired lead against the internal suppression list — no
              external account required. Run this before every dial session; it doesn&rsquo;t
              replace a real TPS/CTPS/DNC bureau run for a campaign that requires one.
            </p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={runInternal} disabled={internalPending || !campaignId}>
                {internalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run internal check"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="pt-3">
            <p className="mb-3 text-xs text-muted">
              No live bureau API is wired up yet (spec section 9 — needs a real account). Run the
              check on the bureau&rsquo;s own portal, then upload its response file here — the file
              itself is retained as evidence, and every matched number is suppressed immediately.
            </p>
            <form action={manualAction} className="flex flex-col gap-3">
              <input type="hidden" name="campaign_id" value={campaignId} />
              <div className="flex flex-col gap-1.5">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="provider" value={provider} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone_column">Phone-number column header in the file</Label>
                <Input
                  id="phone_column"
                  name="phone_column"
                  value={phoneColumn}
                  onChange={(e) => setPhoneColumn(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="evidence_file">Bureau response file (matched numbers)</Label>
                <Input id="evidence_file" name="file" type="file" accept=".csv,.xlsx,.xls" required />
              </div>

              <AnimatePresence>
                {manualState.error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger"
                  >
                    {manualState.error}
                  </motion.p>
                )}
              </AnimatePresence>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <ManualSubmitButton />
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
