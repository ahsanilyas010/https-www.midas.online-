"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCampaignRoster } from "@/lib/actions/attendance-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Puts people on / takes them off a campaign roster (campaign_assignments:
// what next_lead_for_agent reads to decide which campaigns an agent pulls
// leads from). Separate from shifts, but admins look for both here.
export function CampaignRosterPanel({
  people,
  campaigns,
  roster,
}: {
  people: { id: string; full_name: string }[];
  campaigns: { id: string; name: string }[];
  roster: { campaign_id: string; user_id: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const on = new Set(roster.map((r) => `${r.campaign_id}:${r.user_id}`));

  function toggle(campaignId: string, userId: string, next: boolean) {
    startTransition(async () => {
      const r = await setCampaignRoster(campaignId, userId, next);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <CardTitle>Campaign rosters</CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 || people.length === 0 ? (
          <p className="text-xs text-muted">Needs at least one campaign and one active agent.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-2 py-1.5 font-medium">Person</th>
                  {campaigns.map((c) => (
                    <th key={c.id} className="px-2 py-1.5 font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-1.5 text-ink">{p.full_name}</td>
                    {campaigns.map((c) => (
                      <td key={c.id} className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          disabled={pending}
                          checked={on.has(`${c.id}:${p.id}`)}
                          aria-label={`${p.full_name} on ${c.name}`}
                          onChange={(e) => toggle(c.id, p.id, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
