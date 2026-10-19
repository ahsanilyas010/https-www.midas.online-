"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { decideLeave } from "@/lib/actions/attendance-admin";
import { Button } from "@/components/ui/button";

export function LeaveDecisionButtons({ leaveId }: { leaveId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(approve: boolean) {
    startTransition(async () => {
      const result = await decideLeave(leaveId, approve);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(approve ? "Approved" : "Rejected");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="secondary" size="icon" disabled={pending} onClick={() => decide(true)} aria-label="Approve">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-brand-green-text" />}
      </Button>
      <Button variant="secondary" size="icon" disabled={pending} onClick={() => decide(false)} aria-label="Reject">
        <X className="h-3.5 w-3.5 text-danger" />
      </Button>
    </div>
  );
}
