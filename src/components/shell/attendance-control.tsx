"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Coffee, Loader2, LogIn, LogOut, Play } from "lucide-react";
import { clockIn, clockOut, startBreak, endBreak } from "@/lib/actions/attendance-v2";
import { Button } from "@/components/ui/button";
import type { RealTables } from "@/lib/supabase/real-types";

type EventType = RealTables<"attendance_events">["event_type"];

// The header's clock-in control. State is derived from the user's latest
// attendance_events row: no event or clock_out = offline, break_start = on
// break, anything else = working.
export function AttendanceControl({ initialEvent }: { initialEvent: EventType | null }) {
  const [last, setLast] = useState<EventType | null>(initialEvent);
  const [pending, startTransition] = useTransition();

  const offline = last === null || last === "clock_out";
  const onBreak = last === "break_start";

  function run(action: () => Promise<{ error?: string }>, next: EventType, message: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      setLast(next);
    });
  }

  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  if (offline) {
    return (
      <Button size="sm" onClick={() => run(clockIn, "clock_in", "Clocked in")} disabled={pending}>
        {pending ? spinner : <LogIn className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Clock in</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {onBreak ? (
        <Button size="sm" onClick={() => run(endBreak, "break_end", "Back from break")} disabled={pending}>
          {pending ? spinner : <Play className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">End break</span>
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => run(startBreak, "break_start", "On break")} disabled={pending}>
          {pending ? spinner : <Coffee className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Break</span>
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => run(clockOut, "clock_out", "Clocked out")} disabled={pending}>
        {pending ? spinner : <LogOut className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Clock out</span>
      </Button>
    </div>
  );
}
