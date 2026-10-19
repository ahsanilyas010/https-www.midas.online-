"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMyLeadStatus } from "@/lib/actions/my-leads";
import { AGENT_LEAD_STATUSES } from "@/lib/lead-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const options = AGENT_LEAD_STATUSES.includes(status as never) ? AGENT_LEAD_STATUSES : [status, ...AGENT_LEAD_STATUSES];

  return (
    <Select
      value={status}
      onValueChange={(next) =>
        startTransition(async () => {
          const result = await setMyLeadStatus(leadId, next);
          if (result.error) toast.error(result.error);
          else {
            toast.success("Status updated");
            router.refresh();
          }
        })
      }
    >
      <SelectTrigger className="h-8 w-32 text-xs capitalize" disabled={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s} className="capitalize" disabled={!AGENT_LEAD_STATUSES.includes(s as never)}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
