import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPTY_STATS, LEADGEN_ROLES, OutcomeBadge, fmtDateTime, type LeadGenStats } from "../ui";
import { DryRunTester, PayloadReference, SetupGuides, TokenCard } from "./zapier-connector";

export const metadata: Metadata = { title: "Connectors" };

export default async function ConnectorsPage() {
  const profile = await requireRole([...LEADGEN_ROLES]);
  const supabase = await createRealClient();
  const ws = profile.workspace_id;

  const [{ data: tokenRow }, { data: campaigns }, { data: events }, { data: statsData }] = await Promise.all([
    supabase.from("lead_intake_tokens").select("token_prefix, last_used_at").eq("workspace_id", ws).maybeSingle(),
    supabase.rpc("leadgen_campaigns"),
    supabase
      .from("lead_intake_events")
      .select("id, received_at, source, http_status, outcome, phone_last4, error, campaign_id, lead_id")
      .eq("workspace_id", ws)
      .order("received_at", { ascending: false })
      .limit(50),
    supabase.rpc("leadgen_dashboard_stats", { p_days: 14 }),
  ]);

  const stats = { ...EMPTY_STATS, ...((statsData as unknown as LeadGenStats | null) ?? {}) };
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const first = (campaigns ?? [])[0];
  const sample = first ? first.code ?? first.id : "<CAMPAIGN_CODE_OR_ID>";
  const tags = stats.by_source.filter((s) => ["zapier", "apollo", "clay", "webhook"].includes(s.source));

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="font-display text-lg font-semibold text-ink">Connectors</h1>
        <p className="text-xs text-muted">Bring leads in from Apollo, Clay or any Zapier-connected tool.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <TokenCard tokenPrefix={tokenRow?.token_prefix ?? null} lastUsedAt={tokenRow?.last_used_at ?? null} />
          <DryRunTester campaign={sample} />
          <Card>
            <CardHeader>
              <CardTitle>Source tags received</CardTitle>
              <CardDescription>
                The <code>source</code> sent with each lead: <code>zapier</code>, <code>apollo</code> or <code>clay</code>{" "}
                when your Zap sets it (<code>webhook</code> if none is sent).
              </CardDescription>
            </CardHeader>
            <div className="px-4 py-3 text-sm">
              {tags.length === 0 ? (
                <p className="text-muted">No connector leads yet.</p>
              ) : (
                <ul className="space-y-1">
                  {tags.map((t) => (
                    <li key={t.source} className="flex justify-between">
                      <span className="font-medium text-ink">{t.source}</span>
                      <span className="tabular text-muted">
                        {t.total} total · {t.last7} in 7 days
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <SetupGuides campaign={sample} />
          <PayloadReference campaign={sample} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery log</CardTitle>
          <CardDescription>
            The last 50 deliveries to the webhook. Phone numbers are kept to their last four digits only.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">HTTP</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{fmtDateTime(e.received_at)}</td>
                  <td className="px-3 py-1.5 text-xs text-ink">{e.source ?? "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">{e.campaign_id ? campaignName.get(e.campaign_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{e.phone_last4 ? `***${e.phone_last4}` : "—"}</td>
                  <td className="px-3 py-1.5">
                    <OutcomeBadge outcome={e.outcome} />
                  </td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{e.http_status}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">{e.error ?? ""}</td>
                </tr>
              ))}
              {(events ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                    No deliveries yet. Generate a token and send a test lead.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
