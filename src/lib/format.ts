// One place for how dates and times are shown, so every table agrees:
// day-first dates ("22 Oct 2026"), 24-hour times ("18:25") and, for a full
// date-time, the time zone it is in ("22 Oct 2026, 18:25 UTC"). Pass the
// viewer's time zone (profile.timezone) wherever you have it; without one the
// browser's (or the server's) zone is used and the label says which.

type When = string | number | Date | null | undefined;

function toDate(v: When): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// An unknown zone name would throw a RangeError and take the page down with it.
function safeZone(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export const EMPTY = "—";

export function fmtDate(v: When, tz?: string | null): string {
  const d = toDate(v);
  if (!d) return EMPTY;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: safeZone(tz) }).format(d);
}

export function fmtTime(v: When, tz?: string | null): string {
  const d = toDate(v);
  if (!d) return EMPTY;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: safeZone(tz) }).format(d);
}

function zoneLabel(d: Date, tz?: string | null): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone: safeZone(tz) }).formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

export function fmtDateTime(v: When, tz?: string | null): string {
  const d = toDate(v);
  if (!d) return EMPTY;
  return `${fmtDate(d, tz)}, ${fmtTime(d, tz)} ${zoneLabel(d, tz)}`.trim();
}

// "just now", "5 min ago", "3 h ago", "2 d ago"; older than a week falls back to the date.
export function fmtRelative(v: When, now: number = Date.now(), tz?: string | null): string {
  const d = toDate(v);
  if (!d) return EMPTY;
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 0) return fmtDateTime(d, tz);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return fmtDate(d, tz);
}

// "1 agent", "2 agents".
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
