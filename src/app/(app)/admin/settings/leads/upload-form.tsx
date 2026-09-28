"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { uploadLeadBatch, screenLeadBatch, type LeadUploadState } from "@/lib/actions/lead-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
    </Button>
  );
}

export function UploadForm({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const [state, action] = useActionState<LeadUploadState, FormData>(uploadLeadBatch, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campaign_id">Campaign</Label>
        <Select name="campaign_id">
          <SelectTrigger id="campaign_id">
            <SelectValue placeholder="No specific campaign" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">Lead list (CSV or XLSX)</Label>
        <input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv" required className="text-sm text-ink" />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-brand-green-text">
          Uploaded {state.inserted} lead{state.inserted === 1 ? "" : "s"}
          {state.deduped ? ` (skipped ${state.deduped} duplicate/suppressed)` : ""}.
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

export function ScreenButton({ batchId }: { batchId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await screenLeadBatch(batchId);
          router.refresh();
        })
      }
      className="text-xs font-semibold text-brand-blue hover:underline disabled:opacity-60"
    >
      {pending ? "Screening..." : "Mark screened"}
    </button>
  );
}
