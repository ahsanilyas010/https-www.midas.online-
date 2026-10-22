import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { countryToRegion } from "@/lib/campaign-options";
import { manualScreeningProvider } from "@/lib/compliance/screening";
import {
  IMPORT_LIMITS,
  normalizeHeaders,
  validateMapping,
  type ColumnMapping,
  type ColumnPick,
  type ImportPreview,
  type ImportResult,
  type PreviewIssue,
} from "./mapped-import-shared";

// The one lead importer. Parses a CSV/Excel file, applies a user-confirmed
// column mapping (Name, Phone number, Company, Email), normalises numbers to
// E.164 using the campaign's country, skips duplicates / existing leads /
// suppressed numbers, and (only on a real import) creates a lead_batches row
// and the leads. It takes a Supabase client acting as the signed-in user, so
// row-level security still applies; it has no Next.js dependency so
// scripts/import-proof.ts can call it directly.
//
// Compliance: phone_hash is the same sha256-of-E.164 the database computes;
// suppressed numbers are never imported; leads always enter as
// screening_status 'pending'. The only way this module changes screening is
// the explicit `screenNow` option, which calls the existing manual
// screen_lead_batch RPC (a manual check against the workspace suppression
// list, not a live TPS/DNC lookup) and is manager-only.

export class ImportError extends Error {}

export type Db = SupabaseClient<RealDatabase>;

export interface ImportContext {
  supabase: Db;
  workspaceId: string;
  userId: string;
  role: string; // profiles.role of the signed-in user
}

export interface ParsedFile {
  headers: string[];
  rows: string[][]; // data rows only; row i is spreadsheet row i + 2
}

const MANAGER_ROLES = ["super_admin", "ops_manager"];
const IMPORT_ROLES = [...MANAGER_ROLES, "lead_gen"];
const isManagerRole = (role: string) => MANAGER_ROLES.includes(role);

export function phoneHash(e164: string): string {
  return createHash("sha256").update(e164).digest("hex");
}

// ---------------------------------------------------------------- parsing

export function parseTabular(data: Buffer | Uint8Array, filename: string): ParsedFile {
  if (data.byteLength === 0) throw new ImportError("That file is empty.");
  if (data.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new ImportError("That file is larger than 10 MB. Split it into smaller files and import them one at a time.");
  }
  if (!/\.(csv|xlsx|xls)$/i.test(filename)) {
    throw new ImportError("Upload a .csv or .xlsx file.");
  }
  let aoa: unknown[][];
  try {
    // raw: true keeps CSV cells as the original text (so "07700 900123" keeps
    // its leading zero); sheet_to_json(raw: false) then gives Excel cells as
    // the text Excel displays.
    const wb = XLSX.read(data, { type: "buffer", raw: true, cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("no sheet");
    aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  } catch {
    throw new ImportError("Couldn't read that file. Check it is a real .csv or .xlsx file.");
  }
  if (aoa.length === 0) throw new ImportError("That file has no rows.");

  const width = Math.max(...aoa.slice(0, 50).map((r) => r.length));
  const headers = normalizeHeaders(Array.from({ length: width }, (_, i) => aoa[0][i]));
  const rows = aoa
    .slice(1)
    .map((r) => headers.map((_, i) => (r[i] === null || r[i] === undefined ? "" : String(r[i]).trim())))
    .filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) throw new ImportError("That file has a header row but no data rows.");
  if (rows.length > IMPORT_LIMITS.maxRows) {
    throw new ImportError(
      `That file has ${rows.length.toLocaleString("en-GB")} rows. The limit is ${IMPORT_LIMITS.maxRows.toLocaleString("en-GB")} per import: split it and import the parts one at a time.`,
    );
  }
  return { headers, rows };
}

// ------------------------------------------------------------ cleaning

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function toE164(raw: string, region: string): { e164: string } | { reason: string } {
  const v = raw.trim();
  if (!v) return { reason: "No phone number in this row" };
  if (/^\d(\.\d+)?e[+-]?\d+$/i.test(v)) {
    return { reason: "Excel turned this number into scientific notation: format the column as Text and save again" };
  }
  try {
    const p = parsePhoneNumberWithError(v, region as CountryCode);
    if (!p.isPossible()) return { reason: `Not a possible phone number for ${region}` };
    return { e164: p.number };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "TOO_SHORT") return { reason: "Too short to be a phone number" };
    if (code === "TOO_LONG") return { reason: "Too long to be a phone number" };
    if (code === "INVALID_COUNTRY") return { reason: "Unknown country code" };
    return { reason: "Not a phone number" };
  }
}

// ---- dates ------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function tzOffsetMs(utcMs: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Wall-clock time in a timezone -> UTC instant.
function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, sec: number, tz: string | null): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec);
  const check = new Date(guess);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // e.g. 31 Feb
  if (!tz) return check;
  try {
    let ms = guess - tzOffsetMs(guess, tz);
    ms = guess - tzOffsetMs(ms, tz);
    return new Date(ms);
  } catch {
    return check;
  }
}

// Reads the date formats that show up in lead lists: ISO ("2026-03-04",
// "2026-03-04 14:30", with or without a zone), day-first "04/03/2026 14:30"
// (month-first for US campaigns), "4 Mar 2026 2:30pm", "March 4, 2026", and
// Excel serial numbers. A time with no zone is read in the campaign's
// timezone (UTC when that isn't known). Returns null when it can't be read.
export function parseDateTime(raw: string, region: string, tz: string | null): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const time = (h?: string, m?: string, sec?: string, ap?: string) => {
    let hh = h ? +h : 0;
    if (ap) {
      const pm = ap.toLowerCase() === "pm";
      if (hh < 1 || hh > 12) return null;
      hh = (hh % 12) + (pm ? 12 : 0);
    }
    return { h: hh, mi: m ? +m : 0, s: sec ? +sec : 0 };
  };

  // Excel serial number (days since 1899-12-30), read as UTC.
  if (/^\d{4,6}(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (n >= 20000 && n <= 80000) return new Date(Math.round((n - 25569) * 86400000));
    return null;
  }

  // ISO: 2026-03-04, 2026-03-04 14:30, 2026-03-04T14:30:00Z, +01:00
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    const t = time(m[4], m[5], m[6]);
    if (!t) return null;
    if (m[7]) {
      const z = m[7].toUpperCase() === "Z" ? "+00:00" : m[7].length === 5 ? m[7].slice(0, 3) + ":" + m[7].slice(3) : m[7];
      const pad = (n: number) => String(n).padStart(2, "0");
      const d = new Date(`${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}${z}`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return wallToUtc(+m[1], +m[2], +m[3], t.h, t.mi, t.s, tz);
  }

  // 04/03/2026, 4-3-26, 04.03.2026 (+ optional time, am/pm). Day-first except for US/CA.
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    const usFirst = region === "US" || region === "CA";
    let day = usFirst ? +m[2] : +m[1];
    let mon = usFirst ? +m[1] : +m[2];
    if (mon > 12 && day <= 12) [day, mon] = [mon, day];
    const t = time(m[4], m[5], m[6], m[7]);
    if (!t) return null;
    return wallToUtc(y, mon, day, t.h, t.mi, t.s, tz);
  }

  // "4 Mar 2026 2:30pm", "Wed 4th March 2026", "March 4, 2026 at 14:30"
  const dayFirst = v.match(
    /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})(?:[ ,]+(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i,
  );
  const monthFirst = dayFirst
    ? null
    : v.match(
        /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[ ,]+(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i,
      );
  const mm = dayFirst ?? monthFirst;
  if (mm) {
    const dayStr = dayFirst ? mm[1] : mm[2];
    const monStr = (dayFirst ? mm[2] : mm[1]).slice(0, 3).toLowerCase();
    const mon = MONTHS.indexOf(monStr) + 1;
    if (mon === 0) return null;
    const t = time(mm[4], mm[5], mm[6], mm[7]);
    if (!t) return null;
    return wallToUtc(+mm[3], mon, +dayStr, t.h, t.mi, t.s, tz);
  }
  return null;
}

export interface CleanRow {
  row: number;
  campaignId: string;
  campaignName: string;
  name: string | null;
  phone: string;
  hash: string;
  company: string | null;
  email: string | null;
  contact: string | null;
  website: string | null;
  notes: string | null;
  nextStep: string | null;
  appointment: Date | null;
  lastContact: Date | null;
  custom: Record<string, string>;
}
export interface PhonelessRow {
  row: number;
  name: string | null;
  email: string | null;
  campaignId: string;
  region: string;
}

export interface Plan {
  preview: ImportPreview;
  toImport: CleanRow[];
  phoneless: PhonelessRow[];
}

export interface PlanInput {
  parsed: ParsedFile;
  mapping: ColumnMapping;
  campaigns: CampaignInfo[]; // every campaign in the workspace (for the Campaign column)
  defaultCampaignId: string; // the campaign chosen in step 1
  timezone?: string | null; // default campaign's timezone, for dates with no zone
  holdPhoneless?: boolean; // vendor imports keep name/email-only rows as contacts
}

const INVALID_CAP = 50;

const CUSTOM_MAX_KEYS = 40;
const CUSTOM_KEY_MAX = 60;
const CUSTOM_VALUE_MAX = 500;

const normCampaign = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();

export async function buildPlan(ctx: ImportContext, input: PlanInput): Promise<Plan> {
  if (!IMPORT_ROLES.includes(ctx.role)) throw new ImportError("Only an admin, ops manager or lead gen can import leads.");
  const check = validateMapping(input.parsed.headers, input.mapping);
  if (!check.ok) {
    throw new ImportError(Object.values(check.errors)[0] ?? "The column mapping is incomplete.");
  }
  const defaultCampaign = input.campaigns.find((c) => c.id === input.defaultCampaignId);
  if (!defaultCampaign) throw new ImportError("Campaign not found.");
  const tz = input.timezone ?? null;
  const idx = new Map(input.parsed.headers.map((h, i) => [h, i]));
  const at = (r: string[], col: string | undefined) => (col === undefined ? "" : (r[idx.get(col) ?? -1] ?? ""));
  const m = input.mapping;
  const nameCols = m.name && "first" in m.name ? { first: m.name.first, last: m.name.last } : null;
  const nameCol = m.name && "column" in m.name ? m.name.column : undefined;
  const phoneCol = m.phone!.column;
  const optCol = (p: ColumnPick | undefined) => (p && "column" in p ? p.column : undefined);
  const companyCol = optCol(m.company);
  const emailCol = optCol(m.email);
  const contactCol = optCol(m.contact);
  const websiteCol = optCol(m.website);
  const notesCol = optCol(m.notes);
  const nextStepCol = optCol(m.nextStep);
  const apptCol = optCol(m.appointment);
  const lastCol = optCol(m.lastContact);
  const campaignCol = optCol(m.campaign);

  const byName = new Map<string, CampaignInfo>();
  for (const c of input.campaigns) if (!byName.has(normCampaign(c.name))) byName.set(normCampaign(c.name), c);

  // Columns not used by any mapping: kept on the lead as extra information.
  const used = new Set<string>(
    [phoneCol, nameCol, nameCols?.first, nameCols?.last, companyCol, emailCol, contactCol, websiteCol, notesCol, nextStepCol, apptCol, lastCol, campaignCol].filter(
      (c): c is string => Boolean(c),
    ),
  );
  const keepExtra = m.keepExtra !== false;
  const extraCols = keepExtra ? input.parsed.headers.filter((h) => !used.has(h)).slice(0, CUSTOM_MAX_KEYS) : [];

  const invalid: PreviewIssue[] = [];
  let invalidCount = 0;
  const dupes: PreviewIssue[] = [];
  let dupeCount = 0;
  const badDates: PreviewIssue[] = [];
  let badDateCount = 0;
  const unmatched: PreviewIssue[] = [];
  let unmatchedCount = 0;
  let ignoredEmails = 0;
  const phoneless: PhonelessRow[] = [];
  const firstSeenRow = new Map<string, number>();
  const unique: CleanRow[] = [];
  const text = (r: string[], col: string | undefined, max: number) => at(r, col).replace(/\s+/g, " ").trim().slice(0, max) || null;

  input.parsed.rows.forEach((r, i) => {
    const rowNo = i + 2;

    // Which campaign this row belongs to.
    let campaign = defaultCampaign;
    const rawCampaign = at(r, campaignCol).replace(/\s+/g, " ").trim();
    if (campaignCol && rawCampaign) {
      const hit = byName.get(normCampaign(rawCampaign));
      if (hit) campaign = hit;
      else if (!m.fallbackToDefault) {
        unmatchedCount += 1;
        if (unmatched.length < INVALID_CAP) {
          unmatched.push({ row: rowNo, value: rawCampaign, reason: "No campaign with this name in your workspace" });
        }
        return;
      }
    }
    const region = countryToRegion(campaign.country);

    const name =
      (nameCols ? [at(r, nameCols.first), at(r, nameCols.last)].filter(Boolean).join(" ") : at(r, nameCol))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200) || null;
    const company = text(r, companyCol, 200);
    let email: string | null = at(r, emailCol).trim().slice(0, 254) || null;
    if (email && !EMAIL_RE.test(email)) {
      ignoredEmails += 1;
      email = null;
    }
    const rawPhone = at(r, phoneCol);
    const parsed = toE164(rawPhone, region);
    if ("reason" in parsed) {
      if (!rawPhone.trim() && input.holdPhoneless && (name || email)) {
        phoneless.push({ row: rowNo, name, email, campaignId: campaign.id, region });
        return;
      }
      invalidCount += 1;
      if (invalid.length < INVALID_CAP) invalid.push({ row: rowNo, value: rawPhone, reason: parsed.reason });
      return;
    }
    const hash = phoneHash(parsed.e164);
    const first = firstSeenRow.get(hash);
    if (first !== undefined) {
      dupeCount += 1;
      if (dupes.length < INVALID_CAP) dupes.push({ row: rowNo, value: parsed.e164, reason: `Same number as row ${first}` });
      return;
    }
    firstSeenRow.set(hash, rowNo);

    const custom: Record<string, string> = {};
    for (const h of extraCols) {
      const v = at(r, h).trim();
      if (v) custom[h.slice(0, CUSTOM_KEY_MAX)] = v.slice(0, CUSTOM_VALUE_MAX);
    }
    const date = (col: string | undefined, label: string): Date | null => {
      const raw = at(r, col).trim();
      if (!raw) return null;
      const d = parseDateTime(raw, region, tz);
      if (!d) {
        badDateCount += 1;
        if (badDates.length < INVALID_CAP) badDates.push({ row: rowNo, value: raw, reason: `${label} isn't a date we can read` });
        // Keep the original text so nothing in the file is lost.
        if (keepExtra && col) custom[col.slice(0, CUSTOM_KEY_MAX)] = raw.slice(0, CUSTOM_VALUE_MAX);
      }
      return d;
    };

    unique.push({
      row: rowNo,
      campaignId: campaign.id,
      campaignName: campaign.name,
      name,
      phone: parsed.e164,
      hash,
      company,
      email,
      contact: text(r, contactCol, 200),
      website: text(r, websiteCol, 300),
      notes: at(r, notesCol).trim().slice(0, 4000) || null,
      nextStep: text(r, nextStepCol, 500),
      appointment: date(apptCol, "Appointment / follow-up"),
      lastContact: date(lastCol, "Last contact"),
      custom,
    });
  });

  // Already in the workspace / suppressed. leadgen_known_hashes() answers for
  // every importing role (hashes only; lead gen cannot read either table).
  const hashes = unique.map((u) => u.hash);
  const existing = new Set<string>();
  const suppressed = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const { data, error } = await ctx.supabase.rpc("leadgen_known_hashes", { p_hashes: hashes.slice(i, i + 500) });
    if (error) throw new ImportError(`Couldn't check for existing leads: ${error.message}`);
    for (const k of data ?? []) {
      if (!k.phone_hash) continue;
      if (k.kind === "suppressed") suppressed.add(k.phone_hash);
      else existing.add(k.phone_hash);
    }
  }
  let alreadyInWorkspace = 0;
  let suppressedCount = 0;
  const toImport: CleanRow[] = [];
  for (const u of unique) {
    if (suppressed.has(u.hash)) suppressedCount += 1;
    else if (existing.has(u.hash)) alreadyInWorkspace += 1;
    else toImport.push(u);
  }

  const perCampaign = new Map<string, { campaignId: string; name: string; count: number }>();
  for (const t of toImport) {
    const e = perCampaign.get(t.campaignId) ?? { campaignId: t.campaignId, name: t.campaignName, count: 0 };
    e.count += 1;
    perCampaign.set(t.campaignId, e);
  }

  return {
    toImport,
    phoneless,
    preview: {
      totalRows: input.parsed.rows.length,
      willImport: toImport.length,
      invalid,
      invalidCount,
      duplicatesInFile: dupes,
      duplicatesInFileCount: dupeCount,
      alreadyInWorkspace,
      suppressed: suppressedCount,
      ignoredEmails,
      phonelessHeld: phoneless.length,
      invalidDates: badDates,
      invalidDateCount: badDateCount,
      campaignBreakdown: [...perCampaign.values()].sort((a, b) => b.count - a.count),
      unmatchedCampaigns: unmatched,
      unmatchedCampaignCount: unmatchedCount,
      extraColumns: extraCols,
      sample: toImport.slice(0, 6).map((c) => ({
        row: c.row,
        name: c.name,
        phone: c.phone,
        company: c.company,
        email: c.email,
        contact: c.contact,
        website: c.website,
        campaign: c.campaignName,
        notes: c.notes,
        nextStep: c.nextStep,
        appointment: c.appointment ? c.appointment.toISOString() : null,
        lastContact: c.lastContact ? c.lastContact.toISOString() : null,
      })),
      country: countryToRegion(defaultCampaign.country),
      timezone: tz,
    },
  };
}

// ---------------------------------------------------------------- import

export interface CampaignInfo {
  id: string;
  name: string;
  country: string | null;
}

// Name-only campaign list that works for managers and lead gen alike, and is
// always scoped to the caller's workspace by the RPC.
export async function loadCampaigns(ctx: ImportContext): Promise<CampaignInfo[]> {
  const { data, error } = await ctx.supabase.rpc("leadgen_campaigns");
  if (error) throw new ImportError(error.message);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, country: c.country }));
}

export interface ImportOptions extends PlanInput {
  filename: string;
  fileBytes: Uint8Array;
  contentType?: string;
  dataSourceId?: string | null;
  batchLabel?: string; // defaults to the file name
  callMyself?: boolean; // managers only: assign to me + put me on the roster
  screenNow?: boolean; // managers only: run the manual screening check now
  // set by the caller when it already ran buildPlan (avoids doing it twice)
  plan?: Plan;
}

export async function runMappedImport(
  ctx: ImportContext,
  opts: ImportOptions,
): Promise<ImportResult & { phonelessRows: PhonelessRow[]; preview: ImportPreview }> {
  const manager = isManagerRole(ctx.role);
  if ((opts.callMyself || opts.screenNow) && !manager) {
    throw new ImportError("Only an admin or ops manager can screen leads or assign them to themselves.");
  }
  const plan = opts.plan ?? (await buildPlan(ctx, opts));
  if (plan.toImport.length === 0 && plan.phoneless.length === 0) {
    throw new ImportError("Nothing to import: every row was invalid, a duplicate, already in your workspace, suppressed or had an unknown campaign.");
  }

  const sb = ctx.supabase;
  const ws = ctx.workspaceId;
  const p = plan.preview;
  const campaignIds = [...new Set(plan.toImport.map((t) => t.campaignId))];

  // 1. Call-myself roster membership first, so a failure creates nothing.
  let rosteredMe = false;
  if (opts.callMyself) {
    for (const campaignId of campaignIds) {
      const { error } = await sb.from("campaign_assignments").upsert(
        { workspace_id: ws, campaign_id: campaignId, user_id: ctx.userId },
        { onConflict: "campaign_id,user_id", ignoreDuplicates: true },
      );
      if (error) throw new ImportError(`Couldn't put you on this campaign's roster: ${error.message}`);
    }
    rosteredMe = campaignIds.length > 0;
  }

  // 2. Keep the original file (same bucket/path convention as before).
  let storagePath: string | null = null;
  if (plan.toImport.length > 0) {
    const path = `${ws}/${Date.now()}-${opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await sb.storage
      .from("lead-uploads")
      .upload(path, opts.fileBytes, { contentType: opts.contentType || "text/csv" });
    if (upErr) throw new ImportError(`Couldn't store the file: ${upErr.message}`);
    storagePath = path;
  }

  // 3. Batch + leads.
  let batchId = "";
  let screened = 0;
  if (plan.toImport.length > 0) {
    const { data: batch, error: bErr } = await sb
      .from("lead_batches")
      .insert({
        workspace_id: ws,
        campaign_id: opts.defaultCampaignId,
        data_source_id: opts.dataSourceId ?? null,
        source: opts.batchLabel ?? opts.filename,
        uploaded_by: ctx.userId,
        row_count: plan.toImport.length,
        status: "uploaded",
        storage_path: storagePath,
      })
      .select("id")
      .single();
    if (bErr || !batch) throw new ImportError(bErr?.message ?? "Couldn't create the batch.");
    batchId = batch.id;

    try {
      for (let i = 0; i < plan.toImport.length; i += 500) {
        const chunk = plan.toImport.slice(i, i + 500).map((r) => ({
          workspace_id: ws,
          campaign_id: r.campaignId,
          batch_id: batchId,
          data_source_id: opts.dataSourceId ?? null,
          phone_e164: r.phone,
          full_name: r.name,
          company_name: r.company,
          email: r.email,
          contact_name: r.contact,
          website: r.website,
          agent_notes: r.notes,
          next_step: r.nextStep,
          appointment_at: r.appointment ? r.appointment.toISOString() : null,
          last_contact_at: r.lastContact ? r.lastContact.toISOString() : null,
          custom: r.custom,
          source: "upload",
          screening_status: "pending",
          ...(opts.callMyself ? { assigned_to: ctx.userId, assigned_by: ctx.userId } : {}),
        }));
        const { error } = await sb.from("leads").insert(chunk);
        if (error) throw new ImportError(error.message);
      }
    } catch (e) {
      // Managers can undo a half-finished import; lead gen cannot delete.
      if (manager) {
        await sb.from("leads").delete().eq("batch_id", batchId).eq("workspace_id", ws);
        await sb.from("lead_batches").delete().eq("id", batchId).eq("workspace_id", ws);
      }
      throw e instanceof ImportError ? e : new ImportError("The import failed part-way through.");
    }

    // 4. Optional manual screening of just this batch.
    if (opts.screenNow) {
      try {
        const r = await manualScreeningProvider.screenBatch(sb, { batchId, evidenceUrl: null });
        screened = r.screenedCount;
      } catch (e) {
        throw new ImportError(
          `The leads were imported but screening failed: ${e instanceof Error ? e.message : "unknown error"}. You can screen the batch from Compliance.`,
        );
      }
    }
  }

  return {
    batchId,
    imported: plan.toImport.length,
    skippedInvalid: p.invalidCount,
    skippedDuplicates: p.duplicatesInFileCount,
    skippedExisting: p.alreadyInWorkspace,
    skippedSuppressed: p.suppressed,
    skippedUnknownCampaign: p.unmatchedCampaignCount,
    assignedToMe: opts.callMyself ? plan.toImport.length : 0,
    screened,
    rosteredMe,
    phonelessHeld: plan.phoneless.length,
    campaignId: opts.defaultCampaignId,
    campaigns: p.campaignBreakdown,
    phonelessRows: plan.phoneless,
    preview: p,
  };
}
