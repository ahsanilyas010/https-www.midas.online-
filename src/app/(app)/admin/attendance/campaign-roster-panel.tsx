"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignToCampaignDialog } from "@/app/(app)/admin/people/assign-campaign-dialog";

// Lives on the shifts tab because that's where admins have been looking for
// this — putting someone on a shift and putting them on a campaign roster
// are separate concepts (shift_assignments vs campaign_assignments), but
// both are "assign this agent to something" and admins reasonably expect
// both from the same place. Reuses the exact dialog/action the campaign
// detail page's "Manage agents" dialog uses.
export function CampaignRosterPanel({
  people,
  campaigns,
}: {
  people: { id: string; full_name: string }[];
  campaigns: { id: string; name: string; code: string }[];
}) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <CardTitle>Assign agents to campaigns</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted">
          Puts an agent on a campaign&rsquo;s roster — the same roster the campaign&rsquo;s own
          &ldquo;Manage agents&rdquo; dialog manages.
        </p>
        <div className="flex flex-col gap-1.5">
          {people.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2"
            >
              <span className="text-sm text-ink">{p.full_name}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTarget({ id: p.id, name: p.full_name })}
              >
                <Megaphone className="h-3.5 w-3.5" /> Assign to campaign
              </Button>
            </div>
          ))}
          {people.length === 0 && <p className="text-xs text-muted">No active agents.</p>}
        </div>
      </CardContent>

      <AssignToCampaignDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
        userId={target?.id ?? ""}
        userName={target?.name ?? ""}
        campaigns={campaigns}
      />
    </Card>
  );
}
