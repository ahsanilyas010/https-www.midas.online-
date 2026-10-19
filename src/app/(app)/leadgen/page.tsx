import Link from "next/link";
import { CalendarDays, CalendarRange, CheckCircle2, Clock, Inbox, ShieldAlert, UserCheck, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { EMPTY_STATS, LEADGEN_ROLES, OutcomeBadge, fmtDateTime, type LeadGenStats } from "./ui";
import { SourceTrendChart } from "./source-trend-chart";

const DAYS = 14;

export default async function LeadGenDashboard() {
  const profile = await requireRole([...LEADGEN_ROLES]);
  const supabase = await createRealClient();
  const ws = profile.workspace_id;
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const outcomeCount = (outcomes: string[]) =>
    supabase
      .from("lead_intake_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws)
      .in("outcome", outcomes)
      .gte("received_at", since30);

  const [{ data: statsData }, created, duplicate, suppressed, invalid, { data: recent }, { data: campaigns }] =
    await Promise.all([
      supabase.rpc("leadgen_dashboard_stats", { p_days: DAYS }),
      outcomeCount(["created"]),
      outcomeCount(["duplicate"]),
      outcomeCount(["suppressed"]),
      outcomeCount(["invalid", "unauthorized", "error"]),
      supabase
        .from("lead_intake_events")
        .select("id, received_at, source, http_status, outcome, phone_last4, error, campaign_id")
        .eq("workspace_id", ws)
        .order("received_at", { ascending: false })
        .limit(8),
      supabase.rpc("leadgen_campaigns"),
    ]);

  const stats = { ...EMPTY_STATS, ...((statsData as unknown as LeadGenStats | null) ?? {}) };
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  // Pivot the per-day, per-source rows into one object per day.
  const sources = [...new Set(stats.trend.map((t) => t.source))];
  const days: Record<string, string | number>[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const iso = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const row: Record<string, string | number> = { label: iso.slice(5) };
    for (const s of sources) row[s] = 0;
    for (const t of stats.trend) if (t.day === iso) row[t.source] = t.count;
    days.push(row);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-semibold text-ink">Lead generation</h1>
          <p className="text-xs text-muted">
            Find and load leads, then hand them to sales agents. Screening stays with your managers.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/leadgen/leads" className="text-xs font-medium text-brand-blue hover:underline">
            Open lead inbox
          </Link>
          <Link href="/leadgen/connectors" className="text-xs font-medium text-brand-blue hover:underline">
            Connectors
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Inbox} value={stats.added_today} label="Added today" accent="blue" />
        <StatTile icon={CalendarDays} value={stats.added_7d} label="Added, last 7 days" accent="violet" />
        <StatTile icon={CalendarRange} value={stats.added_30d} label="Added, last 30 days" accent="teal" />
        <StatTile icon={Clock} value={stats.pending} label="Pending screening" accent="gold" />
        <StatTile icon={CheckCircle2} value={stats.passed} label="Passed screening" accent="green" />
        <StatTile icon={Users} value={stats.unassigned} label="Unassigned" accent="orange" />
        <StatTile icon={UserCheck} value={stats.assigned} label="Assigned to sales" accent="magenta" />
        <StatTile
          icon={ShieldAlert}
          value={(duplicate.count ?? 0) + (suppressed.count ?? 0) + (invalid.count ?? 0)}
          label="Rejected deliveries, 30 days"
          accent="orange"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads added by source, last {DAYS} days</CardTitle>
            <CardDescription>Manual entry, file imports and connector deliveries, stacked by source tag.</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">No leads added in this window yet.</p>
            ) : (
              <SourceTrendChart data={days} sources={sources} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connector deliveries, 30 days</CardTitle>
            <CardDescription>What the Zapier webhook did with what it received.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Created", created.count ?? 0, "confirm"],
              ["Duplicate", duplicate.count ?? 0, "warning"],
              ["Suppressed number", suppressed.count ?? 0, "danger"],
              ["Invalid / unauthorized", invalid.count ?? 0, "danger"],
            ].map(([label, n, variant]) => (
              <div key={label as string} className="flex items-center justify-between">
                <span className="text-muted">{label}</span>
                <Badge variant={variant as "confirm" | "warning" | "danger"}>{n as number}</Badge>
              </div>
            ))}
            <Link href="/leadgen/connectors" className="block pt-2 text-xs font-medium text-brand-blue hover:underline">
              Set up or test the connector
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads by source</CardTitle>
          <CardDescription>
            Source is the connector tag as sent (zapier, apollo, clay) or the data source name for file imports.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Last 7 days</th>
                <th className="px-3 py-2 font-medium">Pending</th>
                <th className="px-3 py-2 font-medium">Passed</th>
                <th className="px-3 py-2 font-medium">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_source.map((s) => (
                <tr key={s.source} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-medium text-ink">{s.source}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{s.total}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{s.last7}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{s.pending}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{s.passed}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{s.assigned}</td>
                </tr>
              ))}
              {stats.by_source.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    No leads yet. Add one, import a file, or connect Zapier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent connector deliveries</CardTitle>
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
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((e) => (
                <tr key={e.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{fmtDateTime(e.received_at)}</td>
                  <td className="px-3 py-1.5 text-xs text-ink">{e.source ?? "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">{e.campaign_id ? campaignName.get(e.campaign_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{e.phone_last4 ? `***${e.phone_last4}` : "—"}</td>
                  <td className="px-3 py-1.5" title={e.error ?? ""}>
                    <OutcomeBadge outcome={e.outcome} />
                  </td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">{e.http_status}</td>
                </tr>
              ))}
              {(recent ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    No deliveries yet.
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
