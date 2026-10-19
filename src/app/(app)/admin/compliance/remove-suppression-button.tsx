"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeSuppressionEntry } from "@/lib/actions/compliance";
import { Button } from "@/components/ui/button";

export function RemoveSuppressionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="icon"
      variant="secondary"
      disabled={pending}
      aria-label="Remove from suppression list"
      onClick={() => {
        if (!confirm("Remove this number from the suppression list? It becomes dialable again if the lead is screened.")) return;
        startTransition(async () => {
          const r = await removeSuppressionEntry(id);
          if (r.error) toast.error(r.error);
          else {
            toast.success("Removed");
            router.refresh();
          }
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5 text-danger" />
    </Button>
  );
}
