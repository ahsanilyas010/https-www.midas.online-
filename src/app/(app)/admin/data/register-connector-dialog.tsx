"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plug } from "lucide-react";
import { registerConnectorSource, type ActionResult } from "@/lib/actions/data-sources";
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

const initialState: ActionResult = {};

const CONNECTORS = [
  { key: "companies_house", label: "Companies House (UK, free API)" },
  { key: "uk_planning_planit", label: "UK planning applications — PlanIt aggregator" },
  { key: "us_permits_socrata", label: "US municipal building permits — Socrata" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
    </Button>
  );
}

export function RegisterConnectorDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(registerConnectorSource, initialState);
  const [connectorKey, setConnectorKey] = useState(CONNECTORS[0].key);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plug className="h-3.5 w-3.5" /> Register connector
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a connector-backed source</DialogTitle>
          <DialogDescription>
            Market and lawful basis are fixed by the connector — a scheduled or manual fetch will
            route every record through the same validation and screening pipeline.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs_name">Name</Label>
            <Input id="cs_name" name="name" placeholder="Companies House — construction SIC" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Connector</Label>
            <Select value={connectorKey} onValueChange={setConnectorKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONNECTORS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="connector_key" value={connectorKey} />
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
      </DialogContent>
    </Dialog>
  );
}
