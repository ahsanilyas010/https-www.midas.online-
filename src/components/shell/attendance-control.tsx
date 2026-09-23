"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { clockIn, clockOut, setAuxState, type CurrentSession } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Enums } from "@/lib/supabase/types";

const AUX_LABELS: Record<Enums<"aux_state">, string> = {
  available: "Available",
  on_call: "On call",
  after_call_work: "After-call work",
  break: "Break",
  lunch: "Lunch",
  prayer: "Prayer",
  meeting: "Meeting",
  training: "Training",
  system_issue: "System issue",
  idle: "Idle",
  offline: "Offline",
};

function useElapsed(since: string | null) {
  const [elapsed, setElapsed] = useState("00:00:00");
  useEffect(() => {
    if (!since) {
      setElapsed("00:00:00");
      return;
    }
    const start = new Date(since).getTime();
    function tick() {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(s / 3600)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((s % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const sec = (s % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${sec}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return elapsed;
}

export function AttendanceControl({ initialSession }: { initialSession: CurrentSession | null }) {
  const [session, setSession] = useState(initialSession);
  const [pending, startTransition] = useTransition();
  const elapsed = useElapsed(session?.clock_in_at ?? null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
  }, []);

  function handleClockIn() {
    startTransition(async () => {
      const result = await clockIn();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Clocked in");
      setSession({
        id: "",
        work_date: new Date().toISOString().slice(0, 10),
        clock_in_at: new Date().toISOString(),
        clock_out_at: null,
        status: "present",
        late_minutes: 0,
        currentAux: "available",
      });
    });
  }

  function handleClockOut() {
    startTransition(async () => {
      const result = await clockOut();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Clocked out");
      setSession(null);
    });
  }

  function handleAuxChange(state: Enums<"aux_state">) {
    startTransition(async () => {
      const result = await setAuxState(state);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSession((s) => (s ? { ...s, currentAux: state } : s));
    });
  }

  if (!session) {
    return (
      <Button size="sm" onClick={handleClockIn} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Clock in</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Select value={session.currentAux ?? "available"} onValueChange={handleAuxChange}>
        <SelectTrigger className="h-8 w-24 text-xs sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(AUX_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="hidden tabular text-xs text-muted sm:inline">{elapsed}</span>
      <Button size="sm" variant="secondary" onClick={handleClockOut} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Clock out</span>
      </Button>
    </div>
  );
}
