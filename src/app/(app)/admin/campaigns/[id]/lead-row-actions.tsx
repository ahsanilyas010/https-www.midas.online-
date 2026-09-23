"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { markScreened } from "@/lib/actions/leads";
import { assignLead } from "@/lib/actions/assignment";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LeadRowActions({
  leadId,
  screeningStatus,
  doNotCall,
  assignedTo,
  agents,
}: {
  leadId: string;
  screeningStatus: string;
  doNotCall: boolean;
  assignedTo: string | null;
  agents: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (doNotCall) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {screeningStatus !== "passed" && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await markScreened(leadId);
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success("Marked as passed screening");
                router.refresh();
              }
            })
          }
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          Mark screened
        </Button>
      )}
      {screeningStatus === "passed" && !assignedTo && agents.length > 0 && (
        <Select
          onValueChange={(userId) =>
            startTransition(async () => {
              const result = await assignLead(leadId, userId);
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success("Assigned");
                router.refresh();
              }
            })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Assign to…" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
