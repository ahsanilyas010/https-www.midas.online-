import type { Database } from "@/lib/supabase/database.generated";

// One row of call_sheet() (migration 105): a lead, or a phone-less contact
// (kind = 'contact'), with the computed fields the board needs.
export type SheetItem = Database["public"]["Functions"]["call_sheet"]["Returns"][number] & {
  // International format ("+44 1158 708135"), filled in on the server so the
  // phone-number library stays out of the browser bundle.
  phone_display?: string | null;
};

export type Bucket = "overdue" | "upcoming" | "callback" | "new" | "reengage" | "recent";

export const QUIET_DAYS = 7;
const DAY = 86_400_000;

// Mirrors the CASE in call_sheet() so a card can be re-bucketed in the browser
// after the agent logs an outcome, without another round trip.
export function bucketOf(i: SheetItem, now: number): Bucket {
  if (i.kind === "contact") return "new";
  const appt = i.appointment_at ? Date.parse(i.appointment_at) : null;
  const cb = i.callback_due_at ? Date.parse(i.callback_due_at) : null;
  if ((appt !== null && appt < now) || (cb !== null && cb <= now)) return "overdue";
  if (appt !== null) return "upcoming";
  if (cb !== null) return "callback";
  const last = i.last_contact ? Date.parse(i.last_contact) : null;
  if (i.attempts === 0 && last === null) return "new";
  if (last === null || last < now - QUIET_DAYS * DAY) return "reengage";
  return "recent";
}

export const BUCKET_ORDER: Bucket[] = ["overdue", "upcoming", "callback", "reengage", "new", "recent"];

export const BUCKET_HEADING: Record<Bucket, string> = {
  overdue: "Overdue",
  upcoming: "Upcoming",
  callback: "Callback requested",
  reengage: `Re-engage · quiet ${QUIET_DAYS}+ days`,
  new: "New",
  recent: "Recently contacted",
};

// ---------------------------------------------------------------- names

export function cardTitle(i: SheetItem): string {
  const person = [i.first_name, i.last_name].filter(Boolean).join(" ");
  return (
    i.company_name?.trim() ||
    i.full_name?.trim() ||
    person ||
    i.contact_name?.trim() ||
    i.email?.trim() ||
    i.phone_e164?.trim() ||
    "Unnamed lead"
  );
}

// The line under the title: the contact person, else the person's name if the
// title is the company, else the email.
export function cardSubline(i: SheetItem): string | null {
  const title = cardTitle(i);
  const person = [i.first_name, i.last_name].filter(Boolean).join(" ");
  const candidates = [i.contact_name, i.full_name, person, i.email];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && v !== title) return v;
  }
  return null;
}

export function searchHaystack(i: SheetItem): string {
  return [i.company_name, i.full_name, i.first_name, i.last_name, i.contact_name, i.email, i.phone_e164, i.campaign_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function companySearchUrl(i: SheetItem): string {
  const q = [i.company_name || cardTitle(i), i.city].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function websiteHref(w: string | null): string | null {
  const v = w?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  // Never turn javascript:/data: style values into links.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  return `https://${v}`;
}

// ---------------------------------------------------------------- custom

export function humanizeKey(k: string): string {
  const s = k.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : k;
}

export interface CustomEntry {
  key: string;
  label: string;
  value: string;
  full: string;
}

export const CUSTOM_MAX = 160;

// Every non-empty custom key/value, stringified and truncated for display.
export function customEntries(custom: unknown): CustomEntry[] {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return [];
  const out: CustomEntry[] = [];
  for (const [key, raw] of Object.entries(custom as Record<string, unknown>)) {
    if (raw === null || raw === undefined) continue;
    let full: string;
    if (typeof raw === "string") full = raw.trim();
    else if (typeof raw === "number" || typeof raw === "boolean") full = String(raw);
    else {
      try {
        full = JSON.stringify(raw);
      } catch {
        continue;
      }
    }
    if (!full || full === "{}" || full === "[]") continue;
    out.push({
      key,
      label: humanizeKey(key),
      value: full.length > CUSTOM_MAX ? `${full.slice(0, CUSTOM_MAX - 1)}…` : full,
      full,
    });
  }
  return out;
}

// ------------------------------------------------------------ time zones

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function safeTz(tz: string | null | undefined): string {
  const t = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: t });
    return t;
  } catch {
    return "UTC";
  }
}

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

function partsIn(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(ms: number, tz: string): string {
  const p = partsIn(ms, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

// 'Oct 22 · 11:00' in the viewer's time zone.
export function fmtDateTime(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  const p = partsIn(ms, tz);
  return `${MONTHS[p.mo - 1]} ${p.d} · ${pad(p.h)}:${pad(p.mi)}`;
}

// 'today · 11:00' when it is today in the viewer's zone, else 'Oct 8 · 13:00'.
export function fmtDateTimeRelative(iso: string, tz: string, now: number): string {
  const ms = Date.parse(iso);
  if (dayKey(ms, tz) === dayKey(now, tz)) {
    const p = partsIn(ms, tz);
    return `today · ${pad(p.h)}:${pad(p.mi)}`;
  }
  return fmtDateTime(iso, tz);
}

export function fmtDay(iso: string, tz: string): string {
  const p = partsIn(Date.parse(iso), tz);
  return `${MONTHS[p.mo - 1]} ${p.d}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// 'Thursday 22 Oct'
export function fmtHeaderDate(now: number, tz: string): string {
  const p = partsIn(now, tz);
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return `${WEEKDAYS[dow]} ${p.d} ${MONTHS[p.mo - 1]}`;
}

// datetime-local value ('2026-10-22T11:00') for an instant, in zone tz.
export function isoToLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  const p = partsIn(Date.parse(iso), tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

function offsetMs(ms: number, tz: string): number {
  const p = partsIn(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60_000) * 60_000;
}

// A datetime-local value read as wall-clock time in zone tz -> UTC ISO string.
export function localInputToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = asUtc - offsetMs(asUtc, tz);
  guess = asUtc - offsetMs(guess, tz);
  return new Date(guess).toISOString();
}

// ---------------------------------------------------------------- tags

export interface Tag {
  text: string;
  tone: "od" | "up" | "hot" | "plain";
}

const POSITIVE_OUTCOME = /interest|appoint|callback|call back|qualif|meeting|demo/i;

export function cardTags(i: SheetItem, bucket: Bucket, tz: string, now: number): Tag[] {
  const tags: Tag[] = [];
  const appt = i.appointment_at;
  const cb = i.callback_due_at;
  const apptPast = appt && Date.parse(appt) < now;
  const cbPast = cb && Date.parse(cb) <= now;

  if (bucket === "overdue") {
    tags.push({ text: "Overdue", tone: "od" });
    const whens = [apptPast ? appt : null, cbPast ? cb : null].filter(Boolean) as string[];
    whens.sort();
    if (whens[0]) tags.push({ text: `Was ${fmtDateTimeRelative(whens[0], tz, now)}`, tone: "plain" });
  } else if (bucket === "upcoming" && appt) {
    tags.push({ text: "Upcoming", tone: "up" });
    tags.push({ text: `${fmtDateTimeRelative(appt, tz, now)} · confirm`, tone: "plain" });
  }
  if (cb && bucket !== "overdue") {
    tags.push({ text: "Callback requested", tone: "hot" });
    tags.push({ text: `Due ${fmtDateTimeRelative(cb, tz, now)}`, tone: "plain" });
  } else if (cb && bucket === "overdue" && !cbPast) {
    tags.push({ text: "Callback requested", tone: "hot" });
  }
  if (i.last_outcome_label) {
    tags.push({ text: i.last_outcome_label, tone: POSITIVE_OUTCOME.test(i.last_outcome_label) ? "hot" : "plain" });
  }
  if (i.last_contact) tags.push({ text: `Last contact ${fmtDay(i.last_contact, tz)}`, tone: "plain" });
  return tags;
}

// ------------------------------------------------------------ grouping

export interface Group {
  bucket: Bucket;
  items: SheetItem[];
}

export interface Column {
  id: string;
  name: string;
  total: number;
  due: number;
  groups: Group[];
}

export interface Filters {
  q: string;
  campaign: string;
  chips: Set<"overdue" | "upcoming" | "callbacks" | "never">;
}

export function matchesFilters(i: SheetItem, f: Filters, now: number): boolean {
  if (f.campaign && (i.campaign_id ?? "none") !== f.campaign) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !searchHaystack(i).includes(q)) return false;
  if (f.chips.size > 0) {
    const b = bucketOf(i, now);
    const ok =
      (f.chips.has("overdue") && b === "overdue") ||
      (f.chips.has("upcoming") && b === "upcoming") ||
      (f.chips.has("callbacks") && i.callback_due_at !== null) ||
      (f.chips.has("never") && i.attempts === 0 && !i.last_contact);
    if (!ok) return false;
  }
  return true;
}

// Columns are campaigns, busiest (most due items) first; inside a column items
// are grouped by state in BUCKET_ORDER, keeping the server's urgency order.
export function buildColumns(items: SheetItem[], now: number): Column[] {
  const map = new Map<string, { name: string; items: SheetItem[] }>();
  for (const i of items) {
    const id = i.campaign_id ?? "none";
    const col = map.get(id) ?? { name: i.campaign_name ?? "No campaign", items: [] };
    col.items.push(i);
    map.set(id, col);
  }
  const cols: Column[] = [];
  for (const [id, c] of map) {
    const buckets = new Map<Bucket, SheetItem[]>();
    let due = 0;
    for (const i of c.items) {
      const b = bucketOf(i, now);
      if (b === "overdue" || b === "upcoming" || b === "callback") due++;
      buckets.set(b, [...(buckets.get(b) ?? []), i]);
    }
    const groups: Group[] = BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({ bucket: b, items: buckets.get(b)! }));
    cols.push({ id, name: c.name, total: c.items.length, due, groups });
  }
  cols.sort((a, b) => b.due - a.due || b.total - a.total || a.name.localeCompare(b.name));
  return cols;
}

export function formatPhone(e164: string | null): string {
  return e164 ?? "";
}
