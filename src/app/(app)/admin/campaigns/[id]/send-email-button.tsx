"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { sendLeadEmail } from "@/lib/actions/email";
import { Button } from "@/components/ui/button";
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

export function SendEmailButton({
  leadId,
  hasEmail,
  templates,
}: {
  leadId: string;
  hasEmail: boolean;
  templates: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [pending, startTransition] = useTransition();

  if (!hasEmail) return null;

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} title="Send email">
        <Mail className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send email</DialogTitle>
            <DialogDescription>
              Sending to an unsubscribed address is rejected by the database even if this UI is
              bypassed.
            </DialogDescription>
          </DialogHeader>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.length === 0 && (
            <p className="text-xs text-warning">No templates yet for this campaign.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!templateId || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await sendLeadEmail(leadId, templateId);
                  if (result.error) {
                    toast.error(result.error);
                  } else {
                    toast.success("Sent");
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
