"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { screenLeadBatch } from "@/lib/actions/lead-upload";

// Manual screening of one batch: a check against the workspace suppression
// list, not a live TPS/DNC lookup.
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
