"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Megaphone, ShieldAlert } from "lucide-react";
import { createCampaign, type CreateCampaignResult } from "@/lib/actions/campaigns";
import { presetFor, VERTICALS, MARKETS } from "@/lib/campaign-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const initialState: CreateCampaignResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create campaign"}
    </Button>
  );
}

export function CreateCampaignDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCampaign, initialState);
  const [vertical, setVertical] = useState("general");
  const [market, setMarket] = useState("");
  const [clientId, setClientId] = useState("");
  const router = useRouter();

  const preset = useMemo(() => (market ? presetFor(vertical, market) : null), [vertical, market]);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" /> New campaign
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            One market per campaign. The vertical + market combination sets the compliance preset
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Campaign name</Label>
              <Input id="name" name="name" placeholder="Construction — UK" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="CONST-UK" mono required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client_id">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="client_id">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="client_id" value={clientId} />
            {clients.length === 0 && (
              <p className="text-[11px] text-warning">
                No clients yet — add one in Compliance → Clients before creating a campaign.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="market">Market</Label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger id="market">
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="market" value={market} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audience">Audience</Label>
              <Select name="audience" defaultValue="B2C">
                <SelectTrigger id="audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="B2C">B2C</SelectItem>
                  <SelectItem value="B2B">B2B</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vertical">Vertical</Label>
            <Select value={vertical} onValueChange={setVertical}>
              <SelectTrigger id="vertical">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERTICALS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="vertical" value={vertical} />
          </div>

          <AnimatePresence>
            {preset && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-md border border-line bg-canvas p-3"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
                  <ShieldAlert className="h-3.5 w-3.5 text-brand-blue" /> Compliance preset applied
                </div>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {preset.riskTier === "high" && <Badge variant="danger">High risk</Badge>}
                  {preset.riskTier === "elevated" && <Badge variant="warning">Elevated risk</Badge>}
                  {preset.riskTier === "standard" && <Badge variant="neutral">Standard risk</Badge>}
                  {preset.requiresTps && <Badge variant="blue">TPS required</Badge>}
                  {preset.requiresCtps && <Badge variant="blue">CTPS required</Badge>}
                  {preset.requiresUsDnc && <Badge variant="blue">US DNC required</Badge>}
                  <Badge variant="neutral">{preset.screeningMaxAgeDays}d screening expiry</Badge>
                </div>
                {preset.note && <p className="text-[11px] text-muted">{preset.note}</p>}
              </motion.div>
            )}
          </AnimatePresence>

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
