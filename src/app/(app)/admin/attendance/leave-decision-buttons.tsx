"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { decideLeaveRequest } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";

export function LeaveDecisionButtons({ leaveId }: { leaveId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decideLeaveRequest(leaveId, decision);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(decision === "approved" ? "Approved" : "Rejected");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="secondary" size="icon" disabled={pending} onClick={() => decide("approved")}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-brand-green-text" />}
      </Button>
      <Button variant="secondary" size="icon" disabled={pending} onClick={() => decide("rejected")}>
        <X className="h-3.5 w-3.5 text-danger" />
      </Button>
    </div>
  );
}
