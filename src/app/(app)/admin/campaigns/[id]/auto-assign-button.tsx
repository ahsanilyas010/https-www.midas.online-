"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { autoAssignReadyLeads } from "@/lib/actions/assignment";
import { Button } from "@/components/ui/button";

export function AutoAssignButton({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await autoAssignReadyLeads(campaignId);
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success(`Assigned ${result.assigned} lead${result.assigned === 1 ? "" : "s"}`);
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
      Auto-assign
    </Button>
  );
}
