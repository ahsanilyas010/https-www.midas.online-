import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildSessions,
  fmtDuration,
  lateMinutes,
  sessionDate,
  workedMs,
  type AttEvent,
  type ShiftLite,
} from "@/lib/attendance/summary";
import { LeaveDecisionButtons } from "./leave-decision-buttons";
import { CreateShiftDialog } from "./create-shift-dialog";
import { ShiftCard, type ShiftView } from "./shifts-panel";
import { CampaignRosterPanel } from "./campaign-roster-panel";

export const metadata: Metadata = { title: "Attendance" };

const HISTORY_DAYS = 14;

export default async function AttendancePage() {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) redirect("/start");

  const supabase = await createRealClient();
  const ws = profile.workspace_id;
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();

  const [
    { data: events },
    { data: leaveRows },
    { data: shifts },
    { data: assignments },
    { data: people },
    { data: campaigns },
    { data: roster },
  ] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("user_id, event_type, occurred_at")
      .eq("workspace_id", ws)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(10000),
    supabase.from("leave_requests").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    supabase.from("shifts").select("*").eq("workspace_id", ws).order("name"),
    supabase.from("shift_assignments").select("*").eq("workspace_id", ws).order("effective_from", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role").eq("workspace_id", ws).eq("is_active", true).order("full_name"),
    supabase.from("campaigns").select("id, name").eq("workspace_id", ws).neq("status", "archived").order("name"),
    supabase.from("campaign_assignments").select("campaign_id, user_id").eq("workspace_id", ws),
  ]);

  const canManage = ["super_admin", "ops_manager"].includes(profile.role);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const staff = (people ?? []).filter((p) => p.role !== "client");

  // Current shift per user = most recently effective assignment.
  const shiftById = new Map((shifts ?? []).map((s) => [s.id, s]));
  const shiftOfUser = new Map<string, ShiftLite>();
  for (const a of assignments ?? []) {
    if (shiftOfUser.has(a.user_id)) continue;
    const s = shiftById.get(a.shift_id);
    if (s) shiftOfUser.set(a.user_id, s);
  }

  const sessions = buildSessions((events ?? []) as AttEvent[]);
  const todayUtc = new Date().toISOString().slice(0, 10);

  // Live status: the latest open session per user.
  const open = new Map(sessions.filter((s) => !s.clockOut).map((s) => [s.userId, s]));
  const todaySessions = sessions.filter((s) => sessionDate(s, shiftOfUser.get(s.userId) ?? null) === todayUtc || !s.clockOut);

  // History: per agent, over the window.
  const summary = new Map<string, { days: Set<string>; worked: number; late: number; lateDays: number; breaks: number }>();
  for (const s of sessions) {
    const sh = shiftOfUser.get(s.userId) ?? null;
    const row = summary.get(s.userId) ?? { days: new Set<string>(), worked: 0, late: 0, lateDays: 0, breaks: 0 };
    row.days.add(sessionDate(s, sh));
    row.worked += workedMs(s);
    row.breaks += s.breakMs;
    const late = lateMinutes(s, sh);
    if (late > 0) {
      row.late += late;
      row.lateDays += 1;
    }
    summary.set(s.userId, row);
  }

  const leaves = leaveRows ?? [];
  const pendingLeave = leaves.filter((l) => l.status === "pending");

  const shiftViews: ShiftView[] = (shifts ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    start_time: s.start_time,
    end_time: s.end_time,
    timezone: s.timezone,
    grace_minutes: s.grace_minutes,
    days_of_week: s.days_of_week,
    assignments: (assignments ?? [])
      .filter((a) => a.shift_id === s.id)
      .map((a) => ({ id: a.id, user_id: a.user_id, name: nameOf.get(a.user_id) ?? "Unknown" })),
  }));

  return (
    <div className="p-4">
      <Tabs defaultValue="today">
        <TabsList className="mb-4">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="leave">
            Leave requests
            {pendingLeave.length > 0 && (
              <Badge variant="warning" className="ml-1.5">
                {pendingLeave.length}
              </Badge>
            )}
          </TabsTrigger>
          {canManage && <TabsTrigger value="shifts">Shifts</TabsTrigger>}
          {canManage && <TabsTrigger value="rosters">Campaign rosters</TabsTrigger>}
        </TabsList>

        <TabsContent value="today">
          <p className="mb-3 text-xs text-muted">
            {todayUtc} (UTC) · {open.size} on the clock now · derived from clock-in/out and break events
          </p>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Clock in</th>
                  <th className="px-3 py-2 font-medium">Clock out</th>
                  <th className="px-3 py-2 font-medium">Late</th>
                  <th className="px-3 py-2 font-medium">Worked</th>
                </tr>
              </thead>
              <tbody>
                {todaySessions.map((s, i) => {
                  const late = lateMinutes(s, shiftOfUser.get(s.userId) ?? null);
                  return (
                    <tr key={`${s.userId}-${i}`} className="h-[38px] border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{nameOf.get(s.userId) ?? "Unknown"}</td>
                      <td className="px-3 py-1.5">
                        {!s.clockOut ? (
                          <Badge variant={s.onBreak ? "warning" : "confirm"}>{s.onBreak ? "on break" : "clocked in"}</Badge>
                        ) : (
                          <Badge variant="neutral">clocked out</Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5 tabular text-muted">{s.clockIn.toLocaleTimeString()}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{s.clockOut ? s.clockOut.toLocaleTimeString() : "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{late > 0 ? `${late}m` : "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{fmtDuration(workedMs(s))}</td>
                    </tr>
                  );
                })}
                {todaySessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                      No one has clocked in yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <p className="mb-3 text-xs text-muted">Last {HISTORY_DAYS} days per person. Lateness is measured against the person&rsquo;s assigned shift (start + grace).</p>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Shift</th>
                  <th className="px-3 py-2 font-medium">Days present</th>
                  <th className="px-3 py-2 font-medium">Hours worked</th>
                  <th className="px-3 py-2 font-medium">Avg / day</th>
                  <th className="px-3 py-2 font-medium">Break time</th>
                  <th className="px-3 py-2 font-medium">Late days</th>
                  <th className="px-3 py-2 font-medium">Late total</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((p) => {
                  const r = summary.get(p.id);
                  const sh = (assignments ?? []).find((a) => a.user_id === p.id);
                  return (
                    <tr key={p.id} className="h-[38px] border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{p.full_name}</td>
                      <td className="px-3 py-1.5 text-xs text-muted">{sh ? shiftById.get(sh.shift_id)?.name ?? "—" : "None"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r?.days.size ?? 0}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r ? fmtDuration(r.worked) : "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r && r.days.size ? fmtDuration(r.worked / r.days.size) : "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r ? fmtDuration(r.breaks) : "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r?.lateDays ?? 0}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r && r.late ? `${r.late}m` : "—"}</td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      No people to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="leave">
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Dates</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {canManage && <th className="px-3 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.id} className="h-[38px] border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-ink">{nameOf.get(l.user_id) ?? "Unknown"}</td>
                    <td className="px-3 py-1.5 tabular text-muted">
                      {l.from_date} → {l.to_date}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{l.reason ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={l.status === "approved" ? "confirm" : l.status === "rejected" ? "danger" : "warning"}>
                        {l.status}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-1.5 text-right">{l.status === "pending" && <LeaveDecisionButtons leaveId={l.id} />}</td>
                    )}
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="px-3 py-8 text-center text-sm text-muted">
                      No leave requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {canManage && (
          <TabsContent value="shifts">
            <div className="mb-3 flex justify-end">
              <CreateShiftDialog />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shiftViews.map((s) => (
                <ShiftCard key={s.id} shift={s} people={staff} />
              ))}
              {shiftViews.length === 0 && (
                <div className="col-span-full rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-muted">
                  No shifts yet. Create one above.
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="rosters">
            <CampaignRosterPanel people={staff.filter((p) => p.role === "agent" || p.role === "team_lead")} campaigns={campaigns ?? []} roster={roster ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
