"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { createEmailTemplate, type ActionResult } from "@/lib/actions/email";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: ActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create template"}
    </Button>
  );
}

export function CreateTemplateDialog({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createEmailTemplate, initialState);
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
        <Plus className="h-3.5 w-3.5" /> New template
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New email template</DialogTitle>
          <DialogDescription>
            Merge fields: <code className="tabular">{"{{first_name}}"}</code>{" "}
            <code className="tabular">{"{{last_name}}"}</code>{" "}
            <code className="tabular">{"{{company_name}}"}</code>{" "}
            <code className="tabular">{"{{phone}}"}</code>. An unsubscribe link is appended
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl_name">Name</Label>
            <Input id="tpl_name" name="name" placeholder="Follow-up info pack" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" placeholder="Following up, {{first_name}}" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body_html">Body (HTML)</Label>
            <Textarea
              id="body_html"
              name="body_html"
              rows={6}
              placeholder="<p>Hi {{first_name}}, thanks for your time today...</p>"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from_name">From name</Label>
            <Input id="from_name" name="from_name" defaultValue={BRAND.emailFromName} />
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
