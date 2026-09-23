"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Users, X } from "lucide-react";
import { assignAgentToCampaign, removeAgentFromCampaign } from "@/lib/actions/assignment";
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

interface AgentRow {
  id: string;
  name: string;
  dailyTarget: number | null;
}

export function ManageAgentsDialog({
  campaignId,
  assigned,
  roster,
}: {
  campaignId: string;
  assigned: AgentRow[];
  roster: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");
  const [dailyTarget, setDailyTarget] = useState("20");
  const router = useRouter();

  const assignedIds = new Set(assigned.map((a) => a.id));
  const available = roster.filter((r) => !assignedIds.has(r.id));

  function add() {
    if (!userId) {
      toast.error("Pick an agent first.");
      return;
    }
    const target = Math.max(1, Number(dailyTarget) || 20);
    startTransition(async () => {
      const result = await assignAgentToCampaign(campaignId, userId, target);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Agent added to the roster");
        setUserId("");
        router.refresh();
      }
    });
  }

  function remove(agentId: string) {
    startTransition(async () => {
      const result = await removeAgentFromCampaign(campaignId, agentId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Removed from the roster");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Users className="h-3.5 w-3.5" /> Manage agents
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage agents</DialogTitle>
          <DialogDescription>
            Only agents on this roster show up in auto-assign, and only their own campaign shows
            up in their dial workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {assigned.length === 0 && (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              No agents on this roster yet — leads can&rsquo;t be auto-assigned until at least one
              is added below.
            </p>
          )}
          {assigned.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium text-ink">{a.name}</div>
                <div className="tabular text-[11px] text-muted">target: {a.dailyTarget ?? 20}/day</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() => remove(a.id)}
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>Add agent</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder={available.length === 0 ? "No more agents to add" : "Pick an agent"} />
              </SelectTrigger>
              <SelectContent>
                {available.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label>Daily target</Label>
            <Input
              type="number"
              min={1}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
            />
          </div>
          <Button onClick={add} disabled={pending || !userId}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
