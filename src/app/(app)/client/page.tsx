import { Building2, Download, ShieldCheck, Clock, Users, PhoneCall, CheckCircle2, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { loadClientFunnel } from "@/lib/reports/client-funnel";
import { loadClientAgentActivity } from "@/lib/reports/client-activity";
import { loadClientFullVisibility } from "@/lib/reports/client-full-visibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { DailyActivityChart } from "@/components/charts/daily-activity-chart";
import { ClientSelector } from "./client-selector";
import { FullActivityTabs } from "./full-activity-tables";

function fmtHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

const CATEGORY_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  connected_positive: "confirm",
  connected_neutral: "blue",
  connected_negative: "warning",
  no_contact: "neutral",
  invalid: "neutral",
  compliance: "danger",
};

const CATEGORY_LABEL: Record<string, string> = {
  connected_positive: "Positive",
  connected_neutral: "Neutral",
  connected_negative: "Negative",
  no_contact: "No contact",
  invalid: "Invalid",
  compliance: "Compliance",
};

export default async function ClientReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  // Section 6.6: aggregate-only dashboards for client stakeholders — never
  // a lead list, never agent names. That's enforced by role at the
  // database layer (see get_client_funnel in migration 27), not just by
  // what this page chooses to render.
  const profile = await requireProfile();
  if (!["client_viewer", "super_admin", "ops_manager"].includes(profile.role)) redirect("/start");

  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  const { client: clientIdParam } = await searchParams;

  const supabase = await createClient();
  const [outcome, activityOutcome, { data: clients }] = await Promise.all([
    loadClientFunnel(isManager ? (clientIdParam ?? null) : null),
    loadClientAgentActivity(isManager ? (clientIdParam ?? null) : null, 30),
    isManager
      ? supabase.from("clients").select("id, name").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  if (!outcome.ok) {
    return (
      <div className="p-4">
        <Card className="animate-slide-up">
          <CardContent className="py-8 text-center text-sm text-danger">{outcome.error}</CardContent>
        </Card>
      </div>
    );
  }

  const { clientName, rows, dispositions, fullVisibility } = outcome.result;
  const fullOutcome = fullVisibility
    ? await loadClientFullVisibility(isManager ? (clientIdParam ?? null) : null)
    : null;
  const activityRows = activityOutcome.ok ? activityOutcome.rows : [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = activityRows.find((r) => r.day === todayStr);
  const last7 = activityRows.slice(-7);
  const last30 = activityRows;
  const sumBy = (list: typeof activityRows, key: "attendance_minutes" | "calls_attempted" | "connects") =>
    list.reduce((sum, r) => sum + Number(r[key]), 0);
  const totalAttempts = dispositions.reduce((sum, d) => sum + d.attempts, 0);
  const distinctCampaigns = new Set(dispositions.map((d) => d.campaign_id)).size;
  const totals = rows.reduce(
    (acc, r) => ({
      loaded: acc.loaded + r.loaded,
      dialable: acc.dialable + r.dialable,
      contacted: acc.contacted + r.contacted,
      qualified: acc.qualified + r.qualified,
      converted: acc.converted + r.converted,
    }),
    { loaded: 0, dialable: 0, contacted: 0, qualified: 0, converted: 0 },
  );
  const conversionRate = totals.loaded > 0 ? `${Math.round((totals.converted / totals.loaded) * 100)}%` : "—";
  const pdfHref = isManager && clientIdParam ? `/api/client-report?client=${clientIdParam}` : "/api/client-report";

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Building2 className="h-5 w-5 text-brand-blue" /> Client reports
          </h2>
          <p className="text-xs text-muted">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && <ClientSelector clients={clients ?? []} current={clientIdParam ?? "all"} />}
          <Button asChild variant="secondary" size="sm">
            <a href={pdfHref}>
              <Download className="h-3.5 w-3.5" /> Download PDF
            </a>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile className="stagger-1" icon={Users} value={totals.loaded} label="Leads loaded" accent="blue" />
        <StatTile className="stagger-2" icon={PhoneCall} value={totals.contacted} label="Contacted" accent="violet" />
        <StatTile className="stagger-3" icon={CheckCircle2} value={totals.converted} label="Converted" accent="green" />
        <StatTile className="stagger-4" icon={TrendingUp} value={conversionRate} label="Conversion rate" accent="gold" />
      </div>

      <Card className="mb-4 animate-slide-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-brand-blue" /> Agent activity
          </CardTitle>
          <p className="text-xs text-muted">
            Hours worked and calls made on your campaign — today, this week, and this month. Not
            broken out by agent name, only totals for the time working your account.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Today</div>
              <div className="text-xl font-semibold tabular text-ink">
                {fmtHours(Number(today?.attendance_minutes ?? 0))}
              </div>
              <div className="text-xs text-muted">{today?.calls_attempted ?? 0} calls made</div>
            </div>
            <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">This week</div>
              <div className="text-xl font-semibold tabular text-ink">
                {fmtHours(sumBy(last7, "attendance_minutes"))}
              </div>
              <div className="text-xs text-muted">{sumBy(last7, "calls_attempted")} calls made</div>
            </div>
            <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Last 30 days</div>
              <div className="text-xl font-semibold tabular text-ink">
                {fmtHours(sumBy(last30, "attendance_minutes"))}
              </div>
              <div className="text-xs text-muted">{sumBy(last30, "calls_attempted")} calls made</div>
            </div>
          </div>
          {activityRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No activity logged yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DailyActivityChart
                label="Hours worked per day (last 14 days)"
                valueLabel="hours"
                data={last30.slice(-14).map((r) => ({
                  day: r.day,
                  value: Math.round((Number(r.attendance_minutes) / 60) * 10) / 10,
                }))}
              />
              <DailyActivityChart
                label="Calls made per day (last 14 days)"
                valueLabel="calls"
                data={last30.slice(-14).map((r) => ({ day: r.day, value: Number(r.calls_attempted) }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle>Campaign funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No campaigns loaded for this client yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {rows.map((r) => (
                <FunnelChart
                  key={r.campaign_id}
                  label={`${r.campaign_name} (${r.campaign_code})`}
                  data={[
                    { stage: "Loaded", value: r.loaded },
                    { stage: "Dialable", value: r.dialable },
                    { stage: "Contacted", value: r.contacted },
                    { stage: "Qualified", value: r.qualified },
                    { stage: "Converted", value: r.converted },
                  ]}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 animate-slide-up">
        <CardHeader>
          <CardTitle>Agent responses</CardTitle>
          <p className="text-xs text-muted">
            Every outcome an agent has logged against your leads — {totalAttempts} call attempt
            {totalAttempts === 1 ? "" : "s"} in total. Never a transcript or note, only the
            structured response category.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {dispositions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No calls logged yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  {distinctCampaigns > 1 && <th className="px-4 py-2 font-medium">Campaign</th>}
                  <th className="px-4 py-2 font-medium">Response</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium text-right">Attempts</th>
                  <th className="px-4 py-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {dispositions.map((d) => (
                  <tr
                    key={`${d.campaign_id}-${d.disposition_code}`}
                    className="h-[38px] border-b border-line last:border-0"
                  >
                    {distinctCampaigns > 1 && (
                      <td className="px-4 py-1.5 text-xs text-muted">{d.campaign_code}</td>
                    )}
                    <td className="px-4 py-1.5 font-medium text-ink">{d.disposition_label}</td>
                    <td className="px-4 py-1.5">
                      <Badge variant={CATEGORY_BADGE[d.category] ?? "neutral"}>
                        {CATEGORY_LABEL[d.category] ?? d.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-1.5 tabular text-right">{d.attempts}</td>
                    <td className="px-4 py-1.5 tabular text-right text-muted">
                      {totalAttempts > 0 ? `${Math.round((d.attempts / totalAttempts) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {fullOutcome?.ok && (
        <Card className="mt-4 animate-slide-up">
          <CardHeader>
            <CardTitle>Full activity</CardTitle>
            <p className="text-xs text-muted">
              Every lead, call outcome, and scheduled follow-up on your campaigns — everything an
              internal admin sees, except which agent worked it (shown as an anonymous label
              instead of a name).
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <FullActivityTabs
              leads={fullOutcome.leads}
              callLog={fullOutcome.callLog}
              followups={fullOutcome.followups}
            />
          </CardContent>
        </Card>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green-text" />
        {fullVisibility ? (
          <>
            Full visibility enabled for this account — lead detail, call outcomes, and follow-ups
            are all shown. Agent identities are still never shown by name, only a consistent
            anonymous label.
          </>
        ) : (
          <>
            Aggregate counts only — no lead names, phone numbers, emails, or agent identities are
            ever shown here. That is enforced by the database itself (this account has no
            row-level access to individual leads), not just by what this page chooses to display.
          </>
        )}
      </p>
    </div>
  );
}
