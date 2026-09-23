// In-memory stand-in for the PostgREST query builder that
// @supabase/supabase-js exposes. It supports the subset of the API this app
// actually calls (select with embedded relations, eq/neq/in/is/not/or/
// gt/gte/lt/lte/like/ilike, order, limit, range, single/maybeSingle, count,
// insert/update/upsert/delete). Every page and server action keeps its
// original Supabase code; only the client factory changes in demo mode.

import { getStore, newId, nowIso, type Row, type DemoStore } from "./store";
import { computeView, VIEW_NAMES } from "./views";
import { applyRls, type DemoAuthContext } from "./rls";

export interface PgError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface QueryResult<T = unknown> {
  data: T;
  error: PgError | null;
  count: number | null;
  status: number;
  statusText: string;
}

type Predicate = (row: Row) => boolean;

// ---------- select-string parsing ----------

interface SelectNode {
  kind: "column" | "star" | "embed";
  name: string; // column or table name
  alias: string; // output key
  hint?: string; // FK constraint name or "inner"
  inner?: boolean;
  children?: SelectNode[];
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(input: string | undefined): SelectNode[] {
  const src = (input ?? "*").replace(/\s+/g, " ").trim() || "*";
  return splitTopLevel(src).map((part) => {
    if (part === "*") return { kind: "star", name: "*", alias: "*" } as SelectNode;
    const paren = part.indexOf("(");
    if (paren !== -1 && part.endsWith(")")) {
      let head = part.slice(0, paren).trim();
      const body = part.slice(paren + 1, -1);
      let alias: string | undefined;
      if (head.includes(":")) {
        [alias, head] = head.split(":").map((s) => s.trim());
      }
      let hint: string | undefined;
      let inner = false;
      if (head.includes("!")) {
        const bits = head.split("!").map((s) => s.trim());
        head = bits[0];
        for (const b of bits.slice(1)) {
          if (b === "inner") inner = true;
          else if (b !== "left") hint = b;
        }
      }
      return {
        kind: "embed",
        name: head,
        alias: alias ?? head,
        hint,
        inner,
        children: parseSelect(body),
      } as SelectNode;
    }
    let name = part.split("::")[0].trim();
    let alias = name;
    if (name.includes(":")) {
      [alias, name] = name.split(":").map((s) => s.trim());
    }
    return { kind: "column", name, alias } as SelectNode;
  });
}

// ---------- relationships ----------

const SINGULAR: Record<string, string> = {
  campaigns: "campaign",
  clients: "client",
  teams: "team",
  leads: "lead",
  dispositions: "disposition",
  data_sources: "data_source",
  shifts: "shift",
  profiles: "profile",
  email_templates: "template",
  lead_batches: "batch",
  call_attempts: "call_attempt",
  qa_scorecards: "scorecard",
  attendance_sessions: "session",
};

// A bare `profiles(...)` embed with no FK hint: which column on the source
// table points at profiles. (PostgREST requires a hint when ambiguous; the
// app's own queries only omit it where one FK is the obvious one.)
const PROFILE_FK: Record<string, string> = {
  leads: "assigned_to",
  suppression_list: "added_by",
  suppression_runs: "ran_by",
  campaign_assignments: "user_id",
  user_sessions: "user_id",
  attendance_sessions: "user_id",
  leave_requests: "user_id",
  audit_log: "actor_id",
  credential_events: "user_id",
  source_fetch_runs: "triggered_by",
  teams: "team_lead_id",
  qa_reviews: "agent_id",
  call_attempts: "agent_id",
  followups: "assigned_to",
  aux_logs: "user_id",
  email_sends: "agent_id",
  shift_assignments: "user_id",
  zoom_meetings: "host_id",
  dialer_calls: "agent_id",
};

function singular(table: string) {
  return SINGULAR[table] ?? table.replace(/s$/, "");
}

function resolveRelation(
  source: string,
  target: string,
  hint: string | undefined,
  sampleSource: Row | undefined,
  store: DemoStore,
): { type: "one"; fk: string } | { type: "many"; fk: string } | null {
  if (hint && hint.endsWith("_fkey")) {
    const prefix = `${source}_`;
    let col = hint.slice(0, -"_fkey".length);
    if (col.startsWith(prefix)) col = col.slice(prefix.length);
    // Hint may describe a one-to-many relationship instead (target's FK).
    if (col.startsWith(`${target}_`)) return { type: "many", fk: col.slice(target.length + 1) };
    return { type: "one", fk: col };
  }
  if (target === "profiles" && PROFILE_FK[source]) return { type: "one", fk: PROFILE_FK[source] };
  const fkCol = `${singular(target)}_id`;
  if (sampleSource && fkCol in sampleSource) return { type: "one", fk: fkCol };
  // e.g. source_fetch_runs.assigned_team_id -> teams
  const suffixed = sampleSource && Object.keys(sampleSource).find((k) => k.endsWith(`_${fkCol}`));
  if (suffixed) return { type: "one", fk: suffixed };
  const backCol = `${singular(source)}_id`;
  if (tableRows(target, store).some((r) => backCol in r)) return { type: "many", fk: backCol };
  if (!sampleSource) return { type: "one", fk: fkCol };
  return null;
}

function tableRows(table: string, store: DemoStore): Row[] {
  if (VIEW_NAMES.has(table)) return computeView(table, store);
  return store.tables[table] ?? [];
}

function project(
  row: Row,
  nodes: SelectNode[],
  table: string,
  store: DemoStore,
  auth: DemoAuthContext,
): Row | null {
  const out: Row = {};
  for (const node of nodes) {
    if (node.kind === "star") {
      Object.assign(out, row);
    } else if (node.kind === "column") {
      out[node.alias] = row[node.name] ?? null;
    }
  }
  for (const node of nodes) {
    if (node.kind !== "embed") continue;
    const rel = resolveRelation(table, node.name, node.hint, row, store);
    const targetRows = applyRls(node.name, tableRows(node.name, store), auth, store);
    if (!rel) {
      out[node.alias] = null;
      continue;
    }
    if (rel.type === "one") {
      const fkVal = row[rel.fk];
      const match = fkVal == null ? undefined : targetRows.find((r) => r.id === fkVal);
      if (!match && node.inner) return null;
      out[node.alias] = match ? project(match, node.children ?? [], node.name, store, auth) : null;
    } else {
      const matches = targetRows.filter((r) => r[rel.fk] === row.id);
      if (matches.length === 0 && node.inner) return null;
      out[node.alias] = matches
        .map((m) => project(m, node.children ?? [], node.name, store, auth))
        .filter(Boolean);
    }
  }
  return out;
}

// ---------- filter helpers ----------

function parseLiteral(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function loose(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === "number" || typeof b === "number") {
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  return String(a).localeCompare(String(b));
}

function likeToRegex(pattern: string, flags: string) {
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, flags);
}

function parseInList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const s = String(v).trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!s) return [];
  return s.split(",").map((x) => parseLiteral(x.trim().replace(/^"|"$/g, "")));
}

function opPredicate(col: string, op: string, value: unknown): Predicate {
  switch (op) {
    case "eq":
      return (r) => loose(r[col], value);
    case "neq":
      return (r) => !loose(r[col], value);
    case "gt":
      return (r) => r[col] != null && cmp(r[col], value) > 0;
    case "gte":
      return (r) => r[col] != null && cmp(r[col], value) >= 0;
    case "lt":
      return (r) => r[col] != null && cmp(r[col], value) < 0;
    case "lte":
      return (r) => r[col] != null && cmp(r[col], value) <= 0;
    case "is":
      return (r) => (value === null || value === "null" ? r[col] == null : loose(r[col], value));
    case "in": {
      const list = parseInList(value);
      return (r) => list.some((v) => loose(r[col], v));
    }
    case "like":
      return (r) => r[col] != null && likeToRegex(String(value), "").test(String(r[col]));
    case "ilike":
      return (r) => r[col] != null && likeToRegex(String(value), "i").test(String(r[col]));
    case "cs":
      return (r) =>
        Array.isArray(r[col]) && parseInList(value).every((v) => (r[col] as unknown[]).some((x) => loose(x, v)));
    default:
      return () => true;
  }
}

function parseOr(expr: string): Predicate {
  const parts = splitTopLevel(expr);
  const preds = parts.map((p) => {
    const m = p.match(/^([^.]+)\.(not\.)?([a-z]+)\.(.*)$/);
    if (!m) return () => false;
    const [, col, neg, op, raw] = m;
    const pred = opPredicate(col, op, op === "in" ? raw : parseLiteral(raw));
    return neg ? (r: Row) => !pred(r) : pred;
  });
  return (r) => preds.some((p) => p(r));
}

// ---------- unique constraints / defaults ----------

const UNIQUE_KEYS: Record<string, string[][]> = {
  leads: [["campaign_id", "phone_e164"]],
  campaigns: [["code"]],
  email_suppression: [["email"]],
  campaign_assignments: [["campaign_id", "user_id"]],
  suppression_list: [["phone_e164"]],
  client_agent_labels: [["client_id", "agent_id"]],
};

const PRIMARY_KEYS: Record<string, string[]> = {
  campaign_assignments: ["campaign_id", "user_id"],
  email_suppression: ["email"],
  suppression_list: ["phone_e164"],
  client_agent_labels: ["client_id", "agent_id"],
};

const NUMERIC_ID_TABLES = new Set(["audit_log", "credential_events"]);

const DEFAULTS: Record<string, () => Row> = {
  leads: () => ({
    status: "new",
    screening_status: "unscreened",
    attempt_count: 0,
    do_not_call: false,
    custom: {},
    country_code: "GB",
    assigned_to: null,
    next_action_at: null,
    last_attempt_at: null,
    screened_at: null,
    updated_at: nowIso(),
  }),
  profiles: () => ({
    is_active: true,
    must_change_password: false,
    failed_login_count: 0,
    totp_enabled: false,
    allow_login_outside_shift: false,
    timezone: "Asia/Karachi",
    updated_at: nowIso(),
  }),
  campaigns: () => ({
    is_active: false,
    call_days: [1, 2, 3, 4, 5],
    call_window_start: "09:00",
    call_window_end: "20:00",
    max_attempts: 6,
    min_hours_between_attempts: 4,
    screening_max_age_days: 28,
    requires_tps_screening: false,
    requires_ctps_screening: false,
    requires_us_dnc_screening: false,
    requires_offshore_disclosure: false,
    vertical_preset_overridden: false,
    risk_tier: "standard",
    audience: "b2b",
    vertical: "general",
  }),
  clients: () => ({ is_active: true, full_visibility: false, is_data_controller: true }),
  followups: () => ({ status: "pending", priority: "normal", snooze_count: 0, followup_type: "callback" }),
  leave_requests: () => ({ status: "pending", is_half_day: false }),
  shifts: () => ({
    is_active: true,
    days_of_week: [1, 2, 3, 4, 5],
    break_allowance_minutes: 60,
    grace_minutes: 10,
    crosses_midnight: false,
    timezone: "Asia/Karachi",
  }),
  data_sources: () => ({ is_active: true, config: {} }),
  email_templates: () => ({ is_active: true, requires_approval: false }),
  email_sends: () => ({ status: "queued" }),
  source_fetch_runs: () => ({
    status: "running",
    params: {},
    records_found: 0,
    records_imported: 0,
    records_rejected: 0,
    skip_screening: false,
    started_at: nowIso(),
  }),
  qa_reviews: () => ({ scores: {}, fatal_breach: false }),
  suppression_list: () => ({ is_permanent: true }),
  attendance_sessions: () => ({
    break_minutes: 0,
    worked_minutes: 0,
    productive_minutes: 0,
    late_minutes: 0,
    early_leave_minutes: 0,
    is_manual_entry: false,
  }),
  aux_logs: () => ({ started_at: nowIso(), ended_at: null }),
  unphoned_contacts: () => ({ custom: {}, updated_at: nowIso() }),
  zoom_meetings: () => ({ status: "scheduled", duration_minutes: 30 }),
  dialer_calls: () => ({ direction: "outbound", status: "ringing", started_at: nowIso(), duration_seconds: 0, answered_at: null, ended_at: null, recording_url: null }),
};

// Tables whose writes show up on the Security & audit page, mirroring the
// real database's audit triggers.
const AUDITED = new Set([
  "profiles",
  "campaigns",
  "clients",
  "leads",
  "campaign_assignments",
  "suppression_list",
  "data_sources",
  "email_templates",
  "shifts",
  "leave_requests",
  "zoom_meetings",
  "integrations",
]);

function withDefaults(table: string, row: Row, store: DemoStore): Row {
  const base = DEFAULTS[table]?.() ?? {};
  const out: Row = { ...base, ...row };
  if (!("id" in out) && !PRIMARY_KEYS[table]) {
    out.id = NUMERIC_ID_TABLES.has(table) ? ++store.seq : newId();
  }
  if (!("created_at" in out)) out.created_at = nowIso();
  return out;
}

function conflictKey(table: string, row: Row, cols: string[]) {
  return cols.map((c) => String(row[c] ?? "")).join("|");
}

function violatesUnique(table: string, row: Row, rows: Row[], ignore?: Row): PgError | null {
  for (const cols of UNIQUE_KEYS[table] ?? []) {
    const key = conflictKey(table, row, cols);
    if (cols.some((c) => row[c] == null)) continue;
    if (rows.some((r) => r !== ignore && conflictKey(table, r, cols) === key)) {
      return {
        code: "23505",
        message: `duplicate key value violates unique constraint "${table}_${cols.join("_")}_key"`,
      };
    }
  }
  return null;
}

// ---------- the builder ----------

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

export class DemoQueryBuilder implements PromiseLike<QueryResult> {
  private filters: Predicate[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private selectStr: string | undefined;
  private returning = false;
  private singleMode: "single" | "maybe" | null = null;
  private countMode: string | null = null;
  private head = false;
  private mode: Mode = "select";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;
  private csvMode = false;

  constructor(
    private table: string,
    private auth: DemoAuthContext,
  ) {}

  // ----- verbs -----
  select(columns?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") {
      this.selectStr = columns;
    } else {
      this.returning = true;
      this.selectStr = columns;
    }
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.mode = "insert";
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.mode = "update";
    this.payload = values;
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.payload = values;
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  // ----- filters -----
  eq(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "eq", v));
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "neq", v));
    return this;
  }
  gt(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "gt", v));
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "gte", v));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "lt", v));
    return this;
  }
  lte(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "lte", v));
    return this;
  }
  like(col: string, v: string) {
    this.filters.push(opPredicate(col, "like", v));
    return this;
  }
  ilike(col: string, v: string) {
    this.filters.push(opPredicate(col, "ilike", v));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push(opPredicate(col, "is", v));
    return this;
  }
  in(col: string, v: unknown[]) {
    this.filters.push(opPredicate(col, "in", v));
    return this;
  }
  contains(col: string, v: unknown[]) {
    this.filters.push(opPredicate(col, "cs", v));
    return this;
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    const p = opPredicate(col, op, op === "is" ? parseLiteral(String(v)) : v);
    this.filters.push((r) => !p(r));
    return this;
  }
  filter(col: string, op: string, v: unknown) {
    this.filters.push(opPredicate(col, op, v));
    return this;
  }
  or(expr: string) {
    this.filters.push(parseOr(expr));
    return this;
  }

  // ----- modifiers -----
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) return this;
    const asc = opts?.ascending ?? true;
    this.orders.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  csv() {
    this.csvMode = true;
    return this;
  }
  abortSignal() {
    return this;
  }
  returns() {
    return this;
  }
  throwOnError() {
    return this;
  }

  // ----- execution -----
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: QueryResult;
    try {
      result = this.execute();
    } catch (err) {
      result = {
        data: null,
        error: { message: err instanceof Error ? err.message : String(err) },
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private finish(rows: Row[] | null, error: PgError | null = null, count: number | null = null): QueryResult {
    if (error) return { data: null, error, count: null, status: 400, statusText: "Bad Request" };
    if (this.head) return { data: null, error: null, count, status: 200, statusText: "OK" };
    if (rows === null) return { data: null, error: null, count, status: 204, statusText: "No Content" };
    if (this.singleMode) {
      if (rows.length === 1) return { data: rows[0], error: null, count, status: 200, statusText: "OK" };
      if (rows.length === 0 && this.singleMode === "maybe")
        return { data: null, error: null, count, status: 200, statusText: "OK" };
      return {
        data: null,
        error: {
          code: "PGRST116",
          message:
            rows.length === 0
              ? "JSON object requested, multiple (or no) rows returned"
              : "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${rows.length} rows`,
        },
        count: null,
        status: 406,
        statusText: "Not Acceptable",
      };
    }
    return { data: rows, error: null, count, status: 200, statusText: "OK" };
  }

  private shape(rows: Row[]): Row[] {
    const store = getStore();
    const nodes = parseSelect(this.selectStr);
    return rows
      .map((r) => project(r, nodes, this.table, store, this.auth))
      .filter((r): r is Row => r !== null);
  }

  private execute(): QueryResult {
    const store = getStore();
    switch (this.mode) {
      case "select":
        return this.runSelect(store);
      case "insert":
      case "upsert":
        return this.runInsert(store);
      case "update":
        return this.runUpdate(store);
      case "delete":
        return this.runDelete(store);
    }
  }

  private runSelect(store: DemoStore): QueryResult {
    let rows = applyRls(this.table, tableRows(this.table, store), this.auth, store).filter((r) =>
      this.matches(r),
    );
    rows = this.shape(rows);
    const count = this.countMode ? rows.length : null;
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.col];
          const bv = b[o.col];
          if (av == null && bv == null) continue;
          if (av == null) return o.nullsFirst ? -1 : 1;
          if (bv == null) return o.nullsFirst ? 1 : -1;
          const c = cmp(av, bv);
          if (c !== 0) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    if (this.csvMode) {
      const cols = rows[0] ? Object.keys(rows[0]) : [];
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
      return { data: csv, error: null, count, status: 200, statusText: "OK" } as QueryResult;
    }
    return this.finish(rows, null, count);
  }

  private runInsert(store: DemoStore): QueryResult {
    if (VIEW_NAMES.has(this.table)) return this.finish(null, { message: `cannot insert into view ${this.table}` });
    const table = (store.tables[this.table] ??= []);
    const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    const written: Row[] = [];
    const conflictCols = this.onConflict ?? PRIMARY_KEYS[this.table] ?? ["id"];
    for (const raw of input) {
      if (this.mode === "upsert") {
        const existing = table.find((r) => conflictCols.every((c) => raw[c] !== undefined && loose(r[c], raw[c])));
        if (existing) {
          if (this.ignoreDuplicates) continue;
          const before = { ...existing };
          Object.assign(existing, raw);
          if ("updated_at" in existing) existing.updated_at = nowIso();
          written.push(existing);
          this.audit(store, "UPDATE", existing, before);
          continue;
        }
      }
      const row = withDefaults(this.table, raw, store);
      const dup = violatesUnique(this.table, row, table);
      if (dup) {
        if (this.mode === "upsert" && this.ignoreDuplicates) continue;
        return this.finish(null, dup);
      }
      table.push(row);
      written.push(row);
      this.audit(store, "INSERT", row);
    }
    store.version++;
    return this.returning ? this.finish(this.shape(written), null, written.length) : this.finish(null, null, null);
  }

  private runUpdate(store: DemoStore): QueryResult {
    const table = store.tables[this.table] ?? [];
    const visible = new Set(applyRls(this.table, table, this.auth, store));
    const targets = table.filter((r) => visible.has(r) && this.matches(r));
    const patch = (this.payload ?? {}) as Row;
    for (const row of targets) {
      const before = { ...row };
      const candidate = { ...row, ...patch };
      const dup = violatesUnique(this.table, candidate, table, row);
      if (dup) return this.finish(null, dup);
      Object.assign(row, patch);
      if ("updated_at" in row && !("updated_at" in patch)) row.updated_at = nowIso();
      this.audit(store, "UPDATE", row, before);
    }
    store.version++;
    return this.returning ? this.finish(this.shape(targets), null, targets.length) : this.finish(null, null, null);
  }

  private runDelete(store: DemoStore): QueryResult {
    const table = store.tables[this.table] ?? [];
    const removed = table.filter((r) => this.matches(r));
    store.tables[this.table] = table.filter((r) => !removed.includes(r));
    for (const r of removed) this.audit(store, "DELETE", r);
    store.version++;
    return this.returning ? this.finish(this.shape(removed), null, removed.length) : this.finish(null, null, null);
  }

  private audit(store: DemoStore, action: string, row: Row, before?: Row) {
    if (!AUDITED.has(this.table)) return;
    store.tables.audit_log.push({
      id: ++store.seq,
      action,
      actor_id: this.auth.userId,
      entity_type: this.table,
      entity_id: row.id != null ? String(row.id) : null,
      before_data: before ?? null,
      after_data: action === "DELETE" ? null : { ...row },
      created_at: nowIso(),
      ip: "127.0.0.1",
      user_agent: "CallMilalo demo",
    });
  }
}
