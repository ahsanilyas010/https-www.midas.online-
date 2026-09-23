"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Database } from "lucide-react";
import { createDataSource, type ActionResult } from "@/lib/actions/leads";
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

export function CreateDataSourceDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createDataSource, initialState);
  const [lawfulBasis, setLawfulBasis] = useState("legitimate_interest");
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
        <Database className="h-3.5 w-3.5" /> Add data source
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add data source</DialogTitle>
          <DialogDescription>
            Every lead traces back to one of these. &ldquo;It was public&rdquo; is not a lawful
            basis — pick the real one.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds_name">Name</Label>
            <Input id="ds_name" name="name" placeholder="Bristol CC planning" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source_type">Type</Label>
            <Select name="source_type" defaultValue="manual_entry">
              <SelectTrigger id="source_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_supplied">Client supplied</SelectItem>
                <SelectItem value="vendor_licensed">Vendor licensed</SelectItem>
                <SelectItem value="public_open_data">Public open data</SelectItem>
                <SelectItem value="public_api">Public API</SelectItem>
                <SelectItem value="inbound_web_form">Inbound web form</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="manual_entry">Manual entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lawful_basis">Lawful basis</Label>
            <Select value={lawfulBasis} onValueChange={setLawfulBasis}>
              <SelectTrigger id="lawful_basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consent">Consent</SelectItem>
                <SelectItem value="legitimate_interest">Legitimate interest</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="not_personal_data">Not personal data (B2B firmographic)</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="lawful_basis" value={lawfulBasis} />
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add source"}
    </Button>
  );
}
