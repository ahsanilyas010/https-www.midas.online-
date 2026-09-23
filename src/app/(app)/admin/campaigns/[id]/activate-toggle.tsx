"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Power, PowerOff } from "lucide-react";
import { setCampaignActive } from "@/lib/actions/assignment";
import { Button } from "@/components/ui/button";

export function ActivateToggle({ campaignId, isActive }: { campaignId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      const result = await setCampaignActive(campaignId, !isActive);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isActive ? "Campaign deactivated" : "Campaign is live");
        router.refresh();
      }
    });
  }

  return (
    <Button variant={isActive ? "secondary" : "confirm"} size="sm" disabled={pending} onClick={toggle}>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isActive ? (
        <PowerOff className="h-3.5 w-3.5" />
      ) : (
        <Power className="h-3.5 w-3.5" />
      )}
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
