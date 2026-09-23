// In-memory versions of the Postgres functions the app calls via
// supabase.rpc(). Each mirrors the SQL in supabase/migrations closely enough
// that the UI behaves the same (call logging updates the lead, DNC adds a
// suppression, clock-out totals the day, and so on).

import { getStore, newId, nowIso, type Row, type DemoStore } from "./store";
import type { DemoAuthContext } from "./rls";
import type { PgError } from "./query";

type RpcResult = { data: unknown; error: PgError | null };

const ok = (data: unknown): RpcResult => ({ data, error: null });
const fail = (message: string, code?: string): RpcResult => ({ data: null, error: { message, code } });

const isManager = (auth: DemoAuthContext) => auth.role === "super_admin" || auth.role === "ops_manager";

function dayOf(iso: string) {
  return iso.slice(0, 10);
}

function scopeClient(auth: DemoAuthContext, requested: string | undefined): { clientId: string | null } | null {
  if (auth.role === "client_viewer") return auth.clientId ? { clientId: auth.clientId } : null;
  if (isManager(auth)) return { clientId: requested ?? null };
  return null;
}

function agentLabel(store: DemoStore, auth: DemoAuthContext, clientId: string | null, agentId: unknown): string | null {
  if (!agentId) return null;
  const profile = store.tables.profiles.find((p) => p.id === agentId);
  if (auth.role !== "client_viewer") return (profile?.full_name as string) ?? null;
  const labels = store.tables.client_agent_labels;
  let label = labels.find((l) => l.client_id === clientId && l.agent_id === agentId);
  if (!label) {
    const n = labels.filter((l) => l.client_id === clientId).length + 1;
    label = { client_id: clientId, agent_id: agentId, label: `Agent ${n}`, created_at: nowIso() };
    labels.push(label);
  }
  return label.label as string;
}

function openSession(store: DemoStore, userId: string | null) {
  return store.tables.attendance_sessions
    .filter((s) => s.user_id === userId && s.clock_in_at && !s.clock_out_at)
    .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)))[0];
}

function closeAux(store: DemoStore, sessionId: unknown) {
  for (const a of store.tables.aux_logs) {
    if (a.session_id === sessionId && !a.ended_at) {
      a.ended_at = nowIso();
      a.duration_seconds = Math.round((Date.now() - new Date(a.started_at as string).getTime()) / 1000);
    }
  }
}

export function runRpc(fn: string, args: Record<string, unknown>, auth: DemoAuthContext): RpcResult {
  const store = getStore();
  const t = store.tables;
  store.version++;

  switch (fn) {
    case "check_rate_limit":
      return ok(true);

    // ---------- attendance ----------
    case "clock_in": {
      if (openSession(store, auth.userId)) return fail("already clocked in today");
      const assignment = t.shift_assignments.find((a) => a.user_id === auth.userId);
      const shift = assignment ? t.shifts.find((s) => s.id === assignment.shift_id) : undefined;
      const today = new Date().toISOString().slice(0, 10);
      const existing = t.attendance_sessions.find((s) => s.user_id === auth.userId && s.work_date === today);
      if (existing?.clock_out_at) return fail("you have already clocked out for today");
      const id = newId();
      t.attendance_sessions.push({
        id,
        user_id: auth.userId,
        shift_id: shift?.id ?? null,
        work_date: today,
        clock_in_at: nowIso(),
        clock_out_at: null,
        clock_in_ip: args.p_ip ?? null,
        clock_out_ip: null,
        clock_in_device: args.p_device ?? "web",
        status: "present",
        late_minutes: 0,
        early_leave_minutes: 0,
        worked_minutes: 0,
        break_minutes: 0,
        productive_minutes: 0,
        is_manual_entry: false,
        manual_reason: null,
        agent_note: null,
        lead_note: null,
        approved_at: null,
        approved_by: null,
        created_at: nowIso(),
      });
      t.aux_logs.push({ id: newId(), session_id: id, user_id: auth.userId, state: "available", reason: null, started_at: nowIso(), ended_at: null, duration_seconds: null });
      return ok(id);
    }
    case "clock_out": {
      const s = openSession(store, auth.userId);
      if (!s) return fail("not currently clocked in");
      closeAux(store, s.id);
      const breakMinutes = Math.floor(
        t.aux_logs
          .filter((a) => a.session_id === s.id && (a.state === "break" || a.state === "lunch"))
          .reduce((sum, a) => sum + (new Date((a.ended_at as string) ?? nowIso()).getTime() - new Date(a.started_at as string).getTime()) / 1000, 0) / 60,
      );
      const worked = Math.floor((Date.now() - new Date(s.clock_in_at as string).getTime()) / 60000);
      Object.assign(s, {
        clock_out_at: nowIso(),
        clock_out_ip: args.p_ip ?? null,
        worked_minutes: worked,
        break_minutes: breakMinutes,
        productive_minutes: Math.max(worked - breakMinutes, 0),
      });
      return ok(s.id);
    }
    case "set_aux_state": {
      const s = openSession(store, auth.userId);
      if (!s) return fail("not currently clocked in");
      closeAux(store, s.id);
      const id = newId();
      t.aux_logs.push({ id, session_id: s.id, user_id: auth.userId, state: args.p_state, reason: args.p_reason ?? null, started_at: nowIso(), ended_at: null, duration_seconds: null });
      return ok(id);
    }

    // ---------- dialling ----------
    case "record_call_attempt": {
      const lead = t.leads.find((l) => l.id === args.p_lead_id);
      if (!lead) return fail("lead not found");
      if (!(isManager(auth) || lead.assigned_to === auth.userId)) return fail("this lead is not assigned to you");
      const campaign = t.campaigns.find((c) => c.id === lead.campaign_id)!;
      const dispo =
        t.dispositions.find((d) => d.code === args.p_disposition_code && d.campaign_id === campaign.id) ??
        t.dispositions.find((d) => d.code === args.p_disposition_code && d.campaign_id == null);
      if (!dispo) return fail(`unknown disposition code ${args.p_disposition_code}`);
      if (dispo.requires_note && !String(args.p_notes ?? "").trim()) return fail("this disposition requires a note");

      const id = newId();
      const connected = String(dispo.category).startsWith("connected");
      const talk = connected ? 60 + Math.floor(Math.random() * 360) : Math.floor(Math.random() * 20);
      t.call_attempts.push({
        id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        agent_id: auth.userId,
        attempt_no: (lead.attempt_count as number) + 1,
        disposition_id: dispo.id,
        started_at: new Date(Date.now() - talk * 1000).toISOString(),
        ended_at: nowIso(),
        talk_seconds: talk,
        wrap_seconds: args.p_wrap_seconds ?? null,
        notes: args.p_notes ?? null,
        lead_local_time: nowIso(),
        within_call_window: true,
        offshore_disclosure_given: campaign.requires_offshore_disclosure ? true : null,
        screening_run_id: null,
        created_at: nowIso(),
      });

      const code = dispo.code as string;
      const status = dispo.sets_dnc
        ? "suppressed"
        : code === "connected_interested" || code === "interested_follow_up"
          ? "qualified"
          : code === "appointment_set"
            ? "converted"
            : code === "connected_callback" || code === "schedule_callback"
              ? "callback"
              : code === "connected_wrong_number" || code === "invalid_number"
                ? "unreachable"
                : dispo.is_terminal
                  ? "rejected"
                  : "in_progress";
      Object.assign(lead, {
        attempt_count: (lead.attempt_count as number) + 1,
        last_attempt_at: nowIso(),
        last_disposition_id: dispo.id,
        status,
        next_action_at: args.p_next_action_at ?? null,
        do_not_call: Boolean(lead.do_not_call) || Boolean(dispo.sets_dnc),
        updated_at: nowIso(),
      });
      if (dispo.sets_dnc) {
        const existing = t.suppression_list.find((s) => s.phone_e164 === lead.phone_e164);
        if (existing) Object.assign(existing, { reason: "verbal_dnc", evidence_note: args.p_notes ?? null });
        else
          t.suppression_list.push({ phone_e164: lead.phone_e164, reason: "verbal_dnc", added_by: auth.userId, lead_id: lead.id, evidence_note: args.p_notes ?? null, market: campaign.market, source: "agent", is_permanent: true, expires_at: null, created_at: nowIso() });
      }
      // Close any open follow-up for this lead — the call resolved it.
      for (const f of t.followups) {
        if (f.lead_id === lead.id && (f.status === "pending" || f.status === "snoozed")) {
          Object.assign(f, { status: "completed", completed_at: nowIso(), completed_call_id: id });
        }
      }
      return ok(id);
    }
    case "snooze_followup": {
      const f = t.followups.find((x) => x.id === args.p_followup_id);
      if (!f) return fail("follow-up not found");
      if (!(isManager(auth) || f.assigned_to === auth.userId)) return fail("not your follow-up");
      if ((f.snooze_count as number) >= 2) return fail("maximum 2 snoozes reached — resolve it with a disposition instead");
      Object.assign(f, { due_at: new Date(Date.now() + 15 * 60000).toISOString(), snooze_count: (f.snooze_count as number) + 1, status: "snoozed" });
      return ok(f);
    }
    case "promote_unphoned_contact": {
      const c = t.unphoned_contacts.find((x) => x.id === args.p_contact_id);
      if (!c) return fail("contact not found");
      if (t.leads.some((l) => l.campaign_id === c.campaign_id && l.phone_e164 === args.p_phone_e164))
        return fail("duplicate key value violates unique constraint", "23505");
      const id = newId();
      t.leads.push({
        id,
        campaign_id: c.campaign_id,
        data_source_id: c.data_source_id,
        batch_id: null,
        first_name: c.first_name,
        last_name: c.last_name,
        company_name: null,
        job_title: c.role,
        phone_e164: args.p_phone_e164,
        phone_raw: args.p_phone_raw,
        phone_type: "mobile",
        email: c.email,
        city: c.project_town,
        country_code: c.country_hint ?? "GB",
        status: "new",
        screening_status: "unscreened",
        attempt_count: 0,
        do_not_call: false,
        assigned_to: c.assigned_to,
        assigned_at: nowIso(),
        custom: { contact_role: c.role, project_value: c.project_value, project_name: c.project_title },
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      Object.assign(c, { promoted_at: nowIso(), promoted_lead_id: id });
      return ok(id);
    }

    // ---------- reporting ----------
    case "get_agent_scorecard": {
      const from = String(args.p_from);
      const to = String(args.p_to);
      const dispo = new Map(t.dispositions.map((d) => [d.id, d]));
      const groups = new Map<string, Row[]>();
      for (const c of t.call_attempts) {
        const day = dayOf(c.started_at as string);
        if (day < from || day > to) continue;
        if (args.p_campaign_id && c.campaign_id !== args.p_campaign_id) continue;
        const key = `${c.agent_id}|${c.campaign_id}|${day}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
      }
      return ok(
        [...groups.entries()].map(([key, calls]) => {
          const [agent_id, campaign_id, day] = key.split("|");
          const talks = calls.map((c) => c.talk_seconds as number | null).filter((x): x is number => x != null);
          const wraps = calls.map((c) => c.wrap_seconds as number | null).filter((x): x is number => x != null);
          return {
            agent_id,
            campaign_id,
            day,
            calls_attempted: calls.length,
            unique_leads_touched: new Set(calls.map((c) => c.lead_id)).size,
            connects: calls.filter((c) => String(dispo.get(c.disposition_id)?.category ?? "").startsWith("connected")).length,
            conversions: calls.filter((c) => ["connected_interested", "appointment_set"].includes(dispo.get(c.disposition_id)?.code as string)).length,
            talk_seconds: talks.reduce((a, b) => a + b, 0),
            avg_talk_seconds: talks.length ? talks.reduce((a, b) => a + b, 0) / talks.length : 0,
            avg_wrap_seconds: wraps.length ? wraps.reduce((a, b) => a + b, 0) / wraps.length : 0,
          };
        }),
      );
    }
    case "get_client_funnel": {
      const scope = scopeClient(auth, args.p_client_id as string | undefined);
      if (!scope) return auth.role === "client_viewer" ? ok([]) : fail("not authorized");
      return ok(
        t.campaigns
          .filter((c) => !scope.clientId || c.client_id === scope.clientId)
          .map((c) => {
            const leads = t.leads.filter((l) => l.campaign_id === c.id);
            return {
              campaign_id: c.id,
              campaign_name: c.name,
              campaign_code: c.code,
              market: c.market,
              loaded: leads.length,
              dialable: leads.filter((l) => l.screening_status === "passed" && !l.do_not_call && !["converted", "rejected", "suppressed", "unreachable"].includes(l.status as string)).length,
              contacted: leads.filter((l) => (l.attempt_count as number) > 0).length,
              qualified: leads.filter((l) => l.status === "qualified").length,
              converted: leads.filter((l) => l.status === "converted").length,
            };
          }),
      );
    }
    case "get_client_dispositions": {
      const scope = scopeClient(auth, args.p_client_id as string | undefined);
      if (!scope) return auth.role === "client_viewer" ? ok([]) : fail("not authorized");
      const out: Row[] = [];
      const campaigns = t.campaigns.filter((c) => !scope.clientId || c.client_id === scope.clientId);
      for (const c of campaigns.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
        const counts = new Map<unknown, number>();
        for (const a of t.call_attempts) if (a.campaign_id === c.id) counts.set(a.disposition_id, (counts.get(a.disposition_id) ?? 0) + 1);
        const rows = t.dispositions
          .filter((d) => counts.has(d.id))
          .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
        for (const d of rows)
          out.push({ campaign_id: c.id, campaign_name: c.name, campaign_code: c.code, disposition_code: d.code, disposition_label: d.label, category: d.category, attempts: counts.get(d.id) });
      }
      return ok(out);
    }
    case "get_client_agent_activity": {
      const scope = scopeClient(auth, args.p_client_id as string | undefined);
      if (!scope) return auth.role === "client_viewer" ? ok([]) : fail("not authorized");
      const to = (args.p_to as string) ?? new Date().toISOString().slice(0, 10);
      const from = (args.p_from as string) ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      const campaignIds = new Set(t.campaigns.filter((c) => !scope.clientId || c.client_id === scope.clientId).map((c) => c.id));
      const agents = new Set(t.campaign_assignments.filter((a) => campaignIds.has(a.campaign_id)).map((a) => a.user_id));
      const dispo = new Map(t.dispositions.map((d) => [d.id, d]));
      const rows: Row[] = [];
      for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86400_000)) {
        const day = d.toISOString().slice(0, 10);
        const calls = t.call_attempts.filter((c) => campaignIds.has(c.campaign_id) && dayOf(c.started_at as string) === day);
        const att = t.attendance_sessions.filter((s) => agents.has(s.user_id) && s.work_date === day);
        rows.push({
          day,
          agents_active: new Set(calls.map((c) => c.agent_id)).size,
          calls_attempted: calls.length,
          connects: calls.filter((c) => String(dispo.get(c.disposition_id)?.category ?? "").startsWith("connected")).length,
          talk_minutes: calls.reduce((s, c) => s + ((c.talk_seconds as number) ?? 0), 0) / 60,
          wrap_minutes: calls.reduce((s, c) => s + ((c.wrap_seconds as number) ?? 0), 0) / 60,
          attendance_minutes: att.reduce((s, a) => s + ((a.worked_minutes as number) ?? 0), 0),
          productive_minutes: att.reduce((s, a) => s + ((a.productive_minutes as number) ?? 0), 0),
        });
      }
      return ok(rows);
    }
    case "get_client_leads":
    case "get_client_call_log":
    case "get_client_followups": {
      const scope = scopeClient(auth, args.p_client_id as string | undefined);
      if (!scope) return auth.role === "client_viewer" ? ok([]) : fail("not authorized");
      if (auth.role === "client_viewer") {
        const client = t.clients.find((c) => c.id === scope.clientId);
        if (!client?.full_visibility) return fail("full visibility is not enabled for this client");
      }
      const campaigns = new Map(t.campaigns.filter((c) => !scope.clientId || c.client_id === scope.clientId).map((c) => [c.id, c]));
      const leadById = new Map(t.leads.map((l) => [l.id, l]));
      const clientOf = (campaignId: unknown) => (campaigns.get(campaignId)?.client_id as string) ?? null;
      if (fn === "get_client_leads") {
        return ok(
          t.leads
            .filter((l) => campaigns.has(l.campaign_id))
            .map((l) => ({
              id: l.id,
              campaign_id: l.campaign_id,
              campaign_name: campaigns.get(l.campaign_id)!.name,
              campaign_code: campaigns.get(l.campaign_id)!.code,
              first_name: l.first_name,
              last_name: l.last_name,
              company_name: l.company_name,
              job_title: l.job_title,
              phone_e164: l.phone_e164,
              email: l.email,
              address_line1: l.address_line1,
              city: l.city,
              region: l.region,
              postcode: l.postcode,
              status: l.status,
              screening_status: l.screening_status,
              do_not_call: l.do_not_call,
              assigned_agent_label: agentLabel(store, auth, clientOf(l.campaign_id), l.assigned_to),
              attempt_count: l.attempt_count,
              custom: l.custom,
              created_at: l.created_at,
            })),
        );
      }
      if (fn === "get_client_call_log") {
        const dispo = new Map(t.dispositions.map((d) => [d.id, d]));
        return ok(
          t.call_attempts
            .filter((c) => campaigns.has(c.campaign_id))
            .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
            .map((c) => {
              const l = leadById.get(c.lead_id);
              const d = dispo.get(c.disposition_id);
              return {
                id: c.id,
                lead_id: c.lead_id,
                campaign_id: c.campaign_id,
                campaign_code: campaigns.get(c.campaign_id)!.code,
                first_name: l?.first_name ?? null,
                last_name: l?.last_name ?? null,
                company_name: l?.company_name ?? null,
                phone_e164: l?.phone_e164 ?? "",
                agent_label: agentLabel(store, auth, clientOf(c.campaign_id), c.agent_id),
                attempt_no: c.attempt_no,
                disposition_code: d?.code ?? null,
                disposition_label: d?.label ?? null,
                category: d?.category ?? null,
                started_at: c.started_at,
                ended_at: c.ended_at,
                talk_seconds: c.talk_seconds,
                wrap_seconds: c.wrap_seconds,
                notes: c.notes,
              };
            }),
        );
      }
      return ok(
        t.followups
          .filter((f) => campaigns.has(f.campaign_id))
          .map((f) => {
            const l = leadById.get(f.lead_id);
            return {
              id: f.id,
              lead_id: f.lead_id,
              campaign_id: f.campaign_id,
              campaign_code: campaigns.get(f.campaign_id)!.code,
              first_name: l?.first_name ?? null,
              last_name: l?.last_name ?? null,
              company_name: l?.company_name ?? null,
              phone_e164: l?.phone_e164 ?? "",
              agent_label: agentLabel(store, auth, clientOf(f.campaign_id), f.assigned_to),
              followup_type: f.followup_type,
              due_at: f.due_at,
              note: f.note,
              priority: f.priority,
              status: f.status,
              snooze_count: f.snooze_count,
            };
          }),
      );
    }
    case "is_manager":
      return ok(isManager(auth));
    case "auth_role":
      return ok(auth.role);
    default:
      return fail(`function ${fn} is not available in demo mode`);
  }
}
