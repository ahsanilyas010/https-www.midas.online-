// Pure derivation of attendance sessions and daily summaries from the raw
// attendance_events log (clock_in / clock_out / break_start / break_end).

export interface AttEvent {
  user_id: string;
  event_type: "clock_in" | "clock_out" | "break_start" | "break_end";
  occurred_at: string;
}

export interface AttSession {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  breakMs: number;
  onBreak: boolean;
}

export function buildSessions(events: AttEvent[]): AttSession[] {
  const byUser = new Map<string, AttEvent[]>();
  for (const e of events) {
    const arr = byUser.get(e.user_id) ?? [];
    arr.push(e);
    byUser.set(e.user_id, arr);
  }
  const sessions: AttSession[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let cur: AttSession | null = null;
    let breakStart: Date | null = null;
    for (const e of list) {
      const t = new Date(e.occurred_at);
      if (e.event_type === "clock_in") {
        if (cur) sessions.push(cur); // previous session never closed
        cur = { userId, clockIn: t, clockOut: null, breakMs: 0, onBreak: false };
        breakStart = null;
      } else if (!cur) {
        continue;
      } else if (e.event_type === "break_start") {
        breakStart = t;
        cur.onBreak = true;
      } else if (e.event_type === "break_end") {
        if (breakStart) cur.breakMs += t.getTime() - breakStart.getTime();
        breakStart = null;
        cur.onBreak = false;
      } else if (e.event_type === "clock_out") {
        if (breakStart) cur.breakMs += t.getTime() - breakStart.getTime();
        cur.clockOut = t;
        cur.onBreak = false;
        sessions.push(cur);
        cur = null;
        breakStart = null;
      }
    }
    if (cur) sessions.push(cur);
  }
  return sessions;
}

export function workedMs(s: AttSession, now = new Date()): number {
  const end = s.clockOut ?? now;
  return Math.max(0, end.getTime() - s.clockIn.getTime() - s.breakMs);
}

export interface ShiftLite {
  start_time: string; // HH:MM:SS
  days_of_week: number[];
  timezone: string;
  grace_minutes: number;
}

function localParts(d: Date, tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
      dow,
    };
  } catch {
    return localParts(d, "UTC");
  }
}

/** Local calendar date of the clock-in (in the shift's tz, else UTC). */
export function sessionDate(s: AttSession, shift: ShiftLite | null): string {
  return localParts(s.clockIn, shift?.timezone ?? "UTC").date;
}

/** Minutes late versus the shift start + grace (0 if on time / no shift / not a shift day). */
export function lateMinutes(s: AttSession, shift: ShiftLite | null): number {
  if (!shift) return 0;
  const p = localParts(s.clockIn, shift.timezone);
  if (!shift.days_of_week.includes(p.dow)) return 0;
  const [h, m] = shift.start_time.split(":").map(Number);
  const late = p.minutes - (h * 60 + m);
  return late > shift.grace_minutes ? late : 0;
}

export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
