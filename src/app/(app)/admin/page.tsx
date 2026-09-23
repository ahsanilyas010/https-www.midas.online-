import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { Activity, Radio, UserCheck, PhoneCall, Coffee, MoonStar, PhoneOutgoing, PhoneIncoming, Trophy, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import Link from "next/link";
import { Video, ArrowRight } from "lucide-react";

// Aux states (00000000000014_attendance_schema.sql) grouped into the four
// tiles below — a per-state tile each would be too many for a glance-able
// floor view, so this is the same "bucket, don't enumerate" call the aux
// widget itself doesn't make (it shows the raw state) but a summary tile
// grid should.
const AUX_BUCKET: Record<string, "available" | "on_call" | "break" | "away"> = {
  available: "available",
  on_call: "on_call",
  after_call_work: "on_call",
  break: "break",
  lunch: "break",
  prayer: "break",
  meeting: "break",
  training: "break",
  idle: "away",
  offline: "away",
  system_issue: "away",
};

export default async function LiveFloorPage() {
  // Matches ADMIN_NAV's roles for /admin in lib/nav.ts — the nav already
  // hides this from other roles, but the route was still reachable by
  // typing the URL. (RLS scoped what they'd see to their own campaigns,
  // so this was never a data leak — just an inconsistency.)
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: campaigns }, { data: activeSessions }, { data: scorecardRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, code, market, is_active, campaign_assignments(user_id)")
      .order("created_at", { ascending: false }),
    // attendance_select/aux_logs_select RLS (migration 15) already scopes
    // this to every user for is_manager(), or just the team for team_lead
    // — same visibility the page's own role gate above assumes.
    supabase
      .from("attendance_sessions")
      .select("id")
      .eq("work_date", today)
      .is("clock_out_at", null),
    supabase.rpc("get_agent_scorecard", { p_from: today, p_to: today }),
  ]);

  const totalAgents = new Set(
    (campaigns ?? []).flatMap((c) =>
      (c as unknown as { campaign_assignments: { user_id: string }[] }).campaign_assignments.map(
        (a) => a.user_id,
      ),
    ),
  ).size;

  const sessionIds = (activeSessions ?? []).map((s) => s.id);
  const { data: openAux } =
    sessionIds.length > 0
      ? await supabase.from("aux_logs").select("state").in("session_id", sessionIds).is("ended_at", null)
      : { data: [] as { state: string }[] };

  const auxCounts = { available: 0, on_call: 0, break: 0, away: 0 };
  for (const row of openAux ?? []) {
    const bucket = AUX_BUCKET[row.state];
    if (bucket) auxCounts[bucket] += 1;
  }

  const callsToday = (scorecardRows ?? []).reduce(
    (acc, r) => ({
      calls: acc.calls + (r.calls_attempted ?? 0),
      connects: acc.connects + (r.connects ?? 0),
      conversions: acc.conversions + (r.conversions ?? 0),
    }),
    { calls: 0, connects: 0, conversions: 0 },
  );
  const contactRateToday =
    callsToday.calls > 0 ? `${Math.round((callsToday.connects / callsToday.calls) * 100)}%` : "—";

  return (
    <div className="p-4 sm:p-6">
      <div className="brand-banner mb-5 animate-slide-up p-5 sm:p-6">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/80">
              <Radio className="h-3.5 w-3.5 animate-pulse-dot text-emerald-300" /> Live floor
            </div>
            <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
              <span className="text-gold-gradient">{profile.full_name.split(" ")[0]}</span>
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {totalAgents} agents assigned across {(campaigns ?? []).length} campaigns · {callsToday.calls} calls and{" "}
              {callsToday.conversions} conversions so far today.
            </p>
          </div>
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-white/15 px-3 py-2 text-sm font-medium ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 sm:self-auto"
          >
            <Video className="h-4 w-4" /> Zoom meetings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Right now</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile className="stagger-1" icon={UserCheck} value={auxCounts.available} label="Available" accent="green" />
        <StatTile className="stagger-2" icon={PhoneCall} value={auxCounts.on_call} label="On call / wrap-up" accent="violet" />
        <StatTile className="stagger-3" icon={Coffee} value={auxCounts.break} label="On break" accent="gold" />
        <StatTile className="stagger-4" icon={MoonStar} value={auxCounts.away} label="Idle / offline" accent="teal" />
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Today so far</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile className="stagger-1" icon={PhoneOutgoing} value={callsToday.calls} label="Calls attempted" accent="blue" />
        <StatTile className="stagger-2" icon={PhoneIncoming} value={callsToday.connects} label="Connects" accent="magenta" />
        <StatTile className="stagger-3" icon={Trophy} value={callsToday.conversions} label="Conversions" accent="green" />
        <StatTile className="stagger-4" icon={Percent} value={contactRateToday} label="Contact rate" accent="gold" />
      </div>

      {(campaigns ?? []).length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line bg-surface">
          <div className="text-center">
            <Activity className="mx-auto mb-2 h-6 w-6 text-muted" />
            <p className="text-sm text-muted">
              No campaigns yet. Create one in Campaigns to see it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(campaigns ?? []).map((c) => {
            const assignedCount = (
              c as unknown as { campaign_assignments: { user_id: string }[] }
            ).campaign_assignments.length;
            return (
              <Card key={c.id} className="hover-lift animate-slide-up">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <p className="tabular text-xs text-muted">{c.code}</p>
                  </div>
                  {c.is_active ? (
                    <Badge variant="confirm">Live</Badge>
                  ) : (
                    <Badge variant="neutral">Not activated</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="blue">{c.market}</Badge>
                    <span className="text-muted">{assignedCount} agents assigned</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
