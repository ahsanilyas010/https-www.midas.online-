"use client";

import { useEffect, useState, useTransition } from "react";
import { Coffee, LogIn, LogOut, PhoneCall, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLiveFloorData, type LiveFloorData } from "@/lib/actions/live-floor";
import { clockIn, clockOut, startBreak, endBreak } from "@/lib/actions/attendance-v2";
import { reviewLeaveRequest } from "@/lib/actions/attendance-v2";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { GetStartedCard } from "@/components/guide/get-started-card";
import { LeaveRequestForm } from "./leave-request-form";
import type { RealTables } from "@/lib/supabase/real-types";

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  on_call: "On call",
  wrap_up: "Wrap-up",
  break: "Break",
  offline: "Offline",
};
const STATUS_COLOR: Record<string, string> = {
  available: "bg-brand-green",
  on_call: "bg-brand-blue",
  wrap_up: "bg-gold",
  break: "bg-violet",
  offline: "bg-line",
};

function CallDuration({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className="font-mono text-xs text-muted">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function LiveFloorClient({
  workspaceId,
  initialData,
  myLatestEvent,
  canManage,
}: {
  workspaceId: string;
  initialData: LiveFloorData;
  myLatestEvent: RealTables<"attendance_events">["event_type"] | null;
  canManage: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [latestEvent, setLatestEvent] = useState(myLatestEvent);
  const [pending, startTransition] = useTransition();

  // Realtime: any change to calls or attendance_events in this workspace
  // refetches the rolled-up status/stats (spec: "LIVE FLOOR (Realtime)").
  // RLS still governs what workspace_live_status()/workspace_today_stats()
  // return — the subscription only tells us *when* to refetch.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-floor-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `workspace_id=eq.${workspaceId}` }, () => {
        getLiveFloorData().then(setData);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_events", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          getLiveFloorData().then(setData);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const counts = data.statuses.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const contactRate = data.stats.calls_today > 0 ? Math.round((data.stats.connects_today / data.stats.calls_today) * 100) : 0;

  function act(fn: () => Promise<{ error?: string }>, next: typeof latestEvent) {
    startTransition(async () => {
      const res = await fn();
      if (!res.error) setLatestEvent(next);
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <GetStartedCard />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Live floor</h1>
        <div className="flex items-center gap-2">
          {latestEvent === "clock_in" || latestEvent === "break_end" ? (
            <>
              <Button variant="secondary" disabled={pending} onClick={() => act(startBreak, "break_start")}>
                <Coffee className="h-4 w-4" /> Start break
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => act(clockOut, "clock_out")}>
                <LogOut className="h-4 w-4" /> Clock out
              </Button>
            </>
          ) : latestEvent === "break_start" ? (
            <Button disabled={pending} onClick={() => act(endBreak, "break_end")}>
              <CheckCircle2 className="h-4 w-4" /> End break
            </Button>
          ) : (
            <Button disabled={pending} onClick={() => act(clockIn, "clock_in")}>
              <LogIn className="h-4 w-4" /> Clock in
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["available", "on_call", "break", "wrap_up"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{STATUS_LABEL[s]}</span>
              <span className="font-display text-2xl font-semibold text-ink">
                <CountUp value={counts[s] ?? 0} />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex flex-col gap-1 py-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Calls today</span>
            <span className="font-display text-xl font-semibold text-ink">
              <CountUp value={data.stats.calls_today} />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Connects</span>
            <span className="font-display text-xl font-semibold text-ink">
              <CountUp value={data.stats.connects_today} />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 py-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Contact rate</span>
            <span className="font-display text-xl font-semibold text-ink">
              <CountUp value={`${contactRate}%`} />
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          {data.statuses.map((s) => (
            <div key={s.user_id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s.status]}`} />
                <span className="text-sm font-medium text-ink">{s.full_name}</span>
                <span className="text-xs text-muted">{STATUS_LABEL[s.status]}</span>
              </div>
              {s.status === "on_call" && s.call_started_at && (
                <div className="flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5 text-brand-blue" />
                  <CallDuration startedAt={s.call_started_at} />
                </div>
              )}
            </div>
          ))}
          {data.statuses.length === 0 && <p className="py-4 text-center text-sm text-muted">No staff yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Request leave</h2>
          <LeaveRequestForm />
        </CardContent>
      </Card>

      {canManage && data.pendingLeave.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-sm font-semibold text-ink">Leave requests awaiting approval</h2>
            {data.pendingLeave.map((lr) => (
              <div key={lr.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                <span className="text-sm text-ink">
                  {lr.from_date} → {lr.to_date} {lr.reason ? `— ${lr.reason}` : ""}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startTransition(async () => { await reviewLeaveRequest(lr.id, true); getLiveFloorData().then(setData); })}
                    className="text-xs font-semibold text-brand-green-text hover:underline"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => startTransition(async () => { await reviewLeaveRequest(lr.id, false); getLiveFloorData().then(setData); })}
                    className="flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
                  >
                    <XCircle className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
