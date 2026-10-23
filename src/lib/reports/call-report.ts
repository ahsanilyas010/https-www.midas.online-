import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// Per-agent call report: one query over `calls` (row-level security already
// limits who can see which agent's calls), summed per day in TypeScript.
// Shared by the Performance page and the CSV export so they always agree.

export const RANGES = {
  "24h": { label: "Last 24 hours", hours: 24 },
  "7d": { label: "Last 7 days", hours: 24 * 7 },
  "30d": { label: "Last 30 days", hours: 24 * 30 },
} as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(v: string | null | undefined): RangeKey {
  return v && v in RANGES ? (v as RangeKey) : "7d";
}

export interface CallRow {
  id: string;
  startedAt: string;
  agentId: string;
  leadName: string;
  company: string;
  phone: string;
  campaign: string;
  disposition: string;
  group: string;
  talkSeconds: number;
  notes: string;
}

export interface DayTotals {
  day: string; // YYYY-MM-DD (UTC)
  calls: number;
  connects: number;
  conversions: number;
  talkSeconds: number;
}

export interface CallReport {
  rows: CallRow[];
  days: DayTotals[];
  totals: { calls: number; connects: number; conversions: number; talkSeconds: number };
  truncated: boolean;
}

const MAX_ROWS = 5000;

export async function loadCallReport(
  supabase: SupabaseClient<RealDatabase>,
  opts: { workspaceId: string; range: RangeKey; agentId?: string },
): Promise<CallReport> {
  const since = new Date(Date.now() - RANGES[opts.range].hours * 3600_000).toISOString();
  let q = supabase
    .from("calls")
    .select(
      "id, started_at, agent_id, answered_at, ended_at, notes, leads(full_name, company_name, phone_e164), campaigns(name), dispositions(label, outcome_group)",
    )
    .eq("workspace_id", opts.workspaceId)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(MAX_ROWS + 1);
  if (opts.agentId) q = q.eq("agent_id", opts.agentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const list = data ?? [];
  const truncated = list.length > MAX_ROWS;
  const rows: CallRow[] = list.slice(0, MAX_ROWS).map((c) => ({
    id: c.id,
    startedAt: c.started_at,
    agentId: c.agent_id,
    leadName: c.leads?.full_name ?? "",
    company: c.leads?.company_name ?? "",
    phone: c.leads?.phone_e164 ?? "",
    campaign: c.campaigns?.name ?? "",
    disposition: c.dispositions?.label ?? "",
    group: c.dispositions?.outcome_group ?? "",
    talkSeconds:
      c.answered_at && c.ended_at ? Math.max(0, Math.round((Date.parse(c.ended_at) - Date.parse(c.answered_at)) / 1000)) : 0,
    notes: c.notes ?? "",
  }));

  const byDay = new Map<string, DayTotals>();
  const totals = { calls: 0, connects: 0, conversions: 0, talkSeconds: 0 };
  for (const r of rows) {
    const day = r.startedAt.slice(0, 10);
    const d = byDay.get(day) ?? { day, calls: 0, connects: 0, conversions: 0, talkSeconds: 0 };
    const connect = r.group === "connect" || r.group === "conversion";
    d.calls += 1;
    d.talkSeconds += r.talkSeconds;
    totals.calls += 1;
    totals.talkSeconds += r.talkSeconds;
    if (connect) {
      d.connects += 1;
      totals.connects += 1;
    }
    if (r.group === "conversion") {
      d.conversions += 1;
      totals.conversions += 1;
    }
    byDay.set(day, d);
  }
  return { rows, days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)), totals, truncated };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

// RFC 4180 CSV, with a guard so a spreadsheet never runs a cell as a formula.
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function callsToCsv(rows: CallRow[], agentNames: Map<string, string>): string {
  const head = ["Date (UTC)", "Agent", "Lead", "Company", "Phone", "Campaign", "Outcome", "Outcome group", "Talk time (s)", "Notes"];
  const lines = [head.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.startedAt.replace("T", " ").slice(0, 19),
        agentNames.get(r.agentId) ?? "",
        r.leadName,
        r.company,
        r.phone,
        r.campaign,
        r.disposition,
        r.group,
        r.talkSeconds,
        r.notes,
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
