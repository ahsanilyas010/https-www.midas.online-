"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { assignAgentToCampaign } from "@/lib/actions/assignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Shared between admin/people (row menu) and admin/attendance (shifts tab) —
// both are places an admin naturally goes looking to put an agent on a
// campaign's roster, not just the campaign's own "Manage agents" dialog.
// Deliberately rendered as a sibling of whatever opens it (a dropdown item,
// a button) rather than nesting the Dialog inside that trigger's own menu —
// same reason the "Reset password" dialog in this same admin section does
// the same: a Dialog mounted inside a DropdownMenuContent fights the
// dropdown's own unmount/focus-trap teardown when it closes.
export function AssignToCampaignDialog({
  open,
  onOpenChange,
  userId,
  userName,
  campaigns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  campaigns: { id: string; name: string; code: string }[];
}) {
  const [campaignId, setCampaignId] = useState("");
  const [dailyTarget, setDailyTarget] = useState("20");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function assign() {
    if (!campaignId) {
      toast.error("Pick a campaign first.");
      return;
    }
    const target = Math.max(1, Number(dailyTarget) || 20);
    startTransition(async () => {
      const result = await assignAgentToCampaign(campaignId, userId, target);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${userName} added to the campaign roster`);
        setCampaignId("");
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to campaign</DialogTitle>
          <DialogDescription>
            Puts {userName} on a campaign&rsquo;s roster so they show up in auto-assign and see
            its leads in their dial workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder={campaigns.length === 0 ? "No campaigns yet" : "Pick a campaign"} />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Daily target</Label>
            <Input
              type="number"
              min={1}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={assign} disabled={pending || !campaignId}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
