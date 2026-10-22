"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2 } from "lucide-react";
import {
  disconnectZoom,
  reverifyZoom,
  saveZoomCredentials,
  type ZoomSettingsState,
} from "@/lib/actions/zoom-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save and verify"}
    </Button>
  );
}

export function ZoomSettingsForm() {
  const [state, action] = useActionState<ZoomSettingsState, FormData>(saveZoomCredentials, {});
  return (
    <form action={action} className="flex flex-col gap-4" autoComplete="off">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account_id">Account ID</Label>
        <Input id="account_id" name="account_id" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client_id">Client ID</Label>
        <Input id="client_id" name="client_id" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client_secret">Client Secret</Label>
        <Input id="client_secret" name="client_secret" type="password" required autoComplete="new-password" />
        <p className="text-xs text-muted">Stored encrypted. It is never sent back to the browser after saving.</p>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand-green-text">{state.message ?? "Connected."}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

export function ZoomActions() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ZoomSettingsState>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    start(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else toast.success(res.message ?? "Done.");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(reverifyZoom)}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify again"}
      </Button>
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => run(disconnectZoom, "Disconnect Zoom? Meetings cannot be booked until you reconnect.")}
      >
        Disconnect
      </Button>
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy.");
    }
  }
  return (
    <span className="mt-1 flex items-center gap-2 rounded-md border border-line bg-canvas p-2">
      <code className="min-w-0 flex-1 truncate text-xs text-ink">{value}</code>
      <Button type="button" size="sm" variant="secondary" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}
