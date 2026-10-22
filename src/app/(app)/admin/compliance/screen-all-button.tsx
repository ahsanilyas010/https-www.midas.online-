"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { screenAllPending } from "@/lib/actions/compliance";
import { Button } from "@/components/ui/button";

// One button that screens every pending lead in the workspace, so screening
// is always one click away whatever batch (or no batch) the leads came in.
export function ScreenAllButton({ pending }: { pending: number }) {
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const disabled = busy || pending === 0;
  return (
    <Button
      size="sm"
      variant={pending > 0 ? "primary" : "secondary"}
      disabled={disabled}
      title={pending === 0 ? "Every lead has been screened." : undefined}
      onClick={() =>
        startTransition(async () => {
          const r = await screenAllPending();
          if (r.error) {
            toast.error(r.error);
            return;
          }
          toast.success(`Screened ${r.screened ?? 0} lead${r.screened === 1 ? "" : "s"}.`);
          router.refresh();
        })
      }
      data-testid="screen-all-pending"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {pending > 0 ? `Screen ${pending} pending lead${pending === 1 ? "" : "s"}` : "Nothing pending"}
    </Button>
  );
}
