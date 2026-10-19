// `npm run test:leadgen` (tsx --conditions=react-server scripts/leadgen-proof.ts).
//
// Proves the Lead Gen seat against the live database, as real signed-in
// personas (leadgen@, ops@, agent@): migrations 84-86, the lead_gen RPCs,
// the upgraded inbound webhook (the real POST handler is called with real
// NextRequest objects), the dry run, the delivery log, hand-off to a sales
// agent, and the RLS denials.
//
// Everything it creates is tagged and removed afterwards (by the ids it
// created); the workspace's webhook token is restored to what it was.
// Run only against a disposable/staging project seeded with `npm run seed`.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD } from "@/lib/seed/personas";
import { generateIntakeToken } from "@/lib/leads/intake-token";
import { normalizeInbound } from "@/lib/leads/intake-normalize";

// tsx quirk: libphonenumber-js' CJS build does require("../metadata.min.json")
// and tsx resolves that to metadata.min.json.js (an ES module), which breaks
// phone parsing outside Next. Pin the .json file before loading the route.
import Module from "node:module";
import path from "node:path";
const M = Module as unknown as { _resolveFilename: (r: string, p: { filename?: string } | undefined, ...a: unknown[]) => string };
const origResolve = M._resolveFilename;
M._resolveFilename = function (request, parent, ...rest) {
  if (/metadata\.[a-z]+\.json$/.test(request) && parent?.filename?.includes("libphonenumber-js")) {
    return path.resolve(path.dirname(parent.filename), request);
  }
  return origResolve.call(this, request, parent, ...rest);
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient<RealDatabase>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const check = (c: boolean, label: string, detail?: unknown) => {
  if (c) console.log(`  ok    ${label}`);
  else {
    console.error(`  FAIL  ${label}${detail !== undefined ? ` - ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    failures++;
  }
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function as(email: string) {
  const c: SupabaseClient<RealDatabase> = createClient<RealDatabase>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error || !data.user) throw new Error(`sign-in ${email}: ${error?.message}`);
  const { data: p } = await c.from("profiles").select("*").eq("id", data.user.id).single();
  return { c, profile: p! };
}

async function main() {
  const { POST } = await import("@/app/api/leads/inbound/route");
  const lg = await as("leadgen@leadcallient.demo");
  const ops = await as("ops@leadcallient.demo");
  const agent = await as("agent@leadcallient.demo");
  const ws = lg.profile.workspace_id;
  const tag = `lgproof-${Date.now()}`;
  const code = `LG${String(Date.now()).slice(-7)}`;
  const phoneBase = 5558800000 + (Date.now() % 10000);
  const phone = (i: number) => `+1${phoneBase + i}`;
  const ip = `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  check(lg.profile.role === "lead_gen", "leadgen@ signs in with role lead_gen");

  const created = { leads: new Set<string>(), sources: [] as string[], batches: [] as string[], runs: [] as string[], unphoned: [] as string[], paths: [] as string[], supp: [] as string[] };
  let campaignId = "";
  let tokenBackup: RealDatabase["public"]["Tables"]["lead_intake_tokens"]["Row"] | null = null;
  const eventBaseline = new Set<string>();
  const inboxLeadIds = () => [...created.leads];

  const startedAt = new Date().toISOString();
  const { data: ev00 } = await svc.from("lead_intake_events").select("id").eq("workspace_id", ws);
  for (const e of ev00 ?? []) eventBaseline.add(e.id);

  try {
    // --- fixtures (service role): a throwaway campaign with the agent(s) on the roster
    const { data: camp, error: campErr } = await svc
      .from("campaigns")
      .insert({ workspace_id: ws, name: `LeadGen Proof ${tag}`, code, country: "US" })
      .select("id")
      .single();
    if (campErr || !camp) throw campErr ?? new Error("campaign");
    campaignId = camp.id;
    const { data: agents } = await svc.from("profiles").select("id").eq("workspace_id", ws).eq("role", "agent").eq("is_active", true);
    await svc.from("campaign_assignments").insert((agents ?? []).map((a) => ({ workspace_id: ws, campaign_id: campaignId, user_id: a.id })));

    // =============================================================
    console.log("\n1. Pick-lists and aggregates (no direct reads)");
    const { data: camps, error: cErr } = await lg.c.rpc("leadgen_campaigns");
    check(!cErr && (camps ?? []).some((c) => c.id === campaignId), "lead_gen lists campaigns by name through leadgen_campaigns()", cErr?.message);
    const { data: ag, error: agErr } = await lg.c.rpc("leadgen_assignable_agents", { p_campaign_id: campaignId });
    check(!agErr && (ag ?? []).length > 0 && (ag ?? []).every((a) => a.on_roster), "assignable agents (names only) with roster flag", agErr?.message);
    const { data: stats, error: sErr } = await lg.c.rpc("leadgen_dashboard_stats", { p_days: 14 });
    const st = stats as { total?: number; by_source?: unknown[]; trend?: unknown[] } | null;
    check(!sErr && typeof st?.total === "number" && Array.isArray(st?.by_source), "dashboard stats RPC returns aggregates", sErr?.message);

    // =============================================================
    console.log("\n2. Add lead (manual path) and the unowned/unscreened insert policy");
    const manualPhone = phone(1);
    const { data: known0 } = await lg.c.rpc("leadgen_known_hashes", { p_hashes: [hash(manualPhone)] });
    check((known0 ?? []).length === 0, "known-hash pre-check: number is new");
    const { data: l1, error: l1e } = await lg.c
      .from("leads")
      .insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: manualPhone, first_name: "Proof", last_name: "Manual", source: "manual" })
      .select("*")
      .single();
    check(!l1e && !!l1, "lead_gen inserts a lead", l1e?.message);
    if (l1) created.leads.add(l1.id);
    check(l1?.created_by === lg.profile.id, "created_by defaults to the lead_gen user");
    check(l1?.screening_status === "pending" && l1?.assigned_to === null && l1?.status === "new", "lead enters pending, unassigned, new");
    const { data: known1 } = await lg.c.rpc("leadgen_known_hashes", { p_hashes: [hash(manualPhone)] });
    check((known1 ?? []).some((k) => k.kind === "lead"), "known-hash pre-check now reports the duplicate");

    // =============================================================
    console.log("\n3. Data source + file-import pipeline as lead_gen");
    const { data: src, error: srcErr } = await lg.c
      .from("data_sources")
      .insert({ workspace_id: ws, name: `Proof source ${tag}`, source_type: "vendor_licensed", lawful_basis: "legitimate_interest", created_by: lg.profile.id })
      .select("id")
      .single();
    check(!srcErr && !!src, "lead_gen registers a data source", srcErr?.message);
    if (!src) throw new Error("no source");
    created.sources.push(src.id);
    const { data: run, error: runErr } = await lg.c
      .from("source_fetch_runs")
      .insert({ workspace_id: ws, data_source_id: src.id, campaign_id: campaignId, triggered_by: lg.profile.id, records_found: 3, status: "running" })
      .select("id")
      .single();
    check(!runErr && !!run, "lead_gen opens an import run", runErr?.message);
    if (run) created.runs.push(run.id);
    const path = `${ws}/${tag}.csv`;
    const up = await lg.c.storage.from("lead-uploads").upload(path, Buffer.from("phone\n1"), { contentType: "text/csv" });
    check(!up.error, "lead_gen uploads the raw file to lead-uploads", up.error?.message);
    created.paths.push(path);
    const dl = await lg.c.storage.from("lead-uploads").download(path);
    check(!!dl.error, "...but cannot read it back (insert-only)", dl.error ? "denied" : "readable");
    const { data: batch, error: bErr } = await lg.c
      .from("lead_batches")
      .insert({ workspace_id: ws, campaign_id: campaignId, data_source_id: src.id, source: `${tag}.csv`, uploaded_by: lg.profile.id, row_count: 2, storage_path: path })
      .select("id")
      .single();
    check(!bErr && !!batch, "lead_gen creates a lead batch", bErr?.message);
    if (batch) created.batches.push(batch.id);
    const imp = [phone(2), phone(3)];
    const { error: ie } = await lg.c.from("leads").insert(
      imp.map((p) => ({ workspace_id: ws, campaign_id: campaignId, batch_id: batch!.id, data_source_id: src.id, phone_e164: p, full_name: "Proof Import" })),
    );
    check(!ie, "lead_gen bulk-inserts imported leads tagged with batch + source", ie?.message);
    const { data: impRows } = await lg.c.from("leads").select("id, batch_id, data_source_id, screening_status").in("phone_hash", imp.map(hash)).eq("workspace_id", ws);
    check((impRows ?? []).length === 2 && impRows!.every((r) => r.batch_id === batch!.id && r.data_source_id === src.id && r.screening_status === "pending"), "imported leads are visible, pending and carry batch/source");
    for (const r of impRows ?? []) created.leads.add(r.id);
    const { data: un, error: ue } = await lg.c
      .from("unphoned_contacts")
      .insert({ workspace_id: ws, campaign_id: campaignId, data_source_id: src.id, run_id: run?.id, full_name: "Proof Nophone", external_ref: tag })
      .select("id")
      .single();
    check(!ue && !!un, "phone-less contact held in unphoned_contacts", ue?.message);
    if (un) created.unphoned.push(un.id);
    await lg.c.from("source_fetch_runs").update({ status: "complete", finished_at: new Date().toISOString(), batch_id: batch?.id, records_imported: 2 }).eq("id", run!.id);
    const { data: runBack } = await lg.c.from("source_fetch_runs").select("status").eq("id", run!.id).single();
    check(runBack?.status === "complete", "lead_gen finishes its own run");
    const { data: dsList } = await lg.c.from("data_sources").select("id").eq("workspace_id", ws);
    check((dsList ?? []).some((d) => d.id === src.id), "lead_gen can choose from registered data sources");

    // =============================================================
    console.log("\n4. Inbound webhook (real POST handler) + delivery log");
    const { data: tok } = await svc.from("lead_intake_tokens").select("*").eq("workspace_id", ws).maybeSingle();
    tokenBackup = tok ?? null;
    const t = generateIntakeToken();
    const { error: tkErr } = await lg.c.from("lead_intake_tokens").upsert(
      { workspace_id: ws, token_hash: t.hash, token_prefix: t.prefix, created_by: lg.profile.id, rotated_at: new Date().toISOString(), last_used_at: null },
      { onConflict: "workspace_id" },
    );
    check(!tkErr, "lead_gen generates/rotates the webhook token", tkErr?.message);

    const deliver = async (body: unknown, opts: { query?: string; bearer?: string; headers?: Record<string, string> } = {}) => {
      const req = new NextRequest(`http://localhost/api/leads/inbound${opts.query ?? ""}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip, authorization: `Bearer ${opts.bearer ?? t.token}`, ...(opts.headers ?? {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      const res = await POST(req);
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const newEvents = async () => {
      const { data } = await svc.from("lead_intake_events").select("*").eq("workspace_id", ws).order("received_at");
      return (data ?? []).filter((e) => !eventBaseline.has(e.id));
    };

    const apollo = {
      "First Name": "Ada",
      "Last Name": "Proof",
      work_email: "ada.proof@example.com",
      "Mobile Phone": phone(10),
      organization_name: "Proof Engines",
      job_title: "CTO",
      linkedin_url: "https://linkedin.com/in/ada-proof",
      city: "Austin",
      state: "TX",
      country: "United States",
      campaign: code,
      source: "apollo",
      consent: "true",
      consent_text: "B2B legitimate interest (proof).",
      apollo_score: 87,
    };

    const norm = normalizeInbound(apollo);
    check(norm.fields.first_name === "Ada" && norm.fields.email === "ada.proof@example.com" && norm.fields.company_name === "Proof Engines" && norm.fields.campaign === code && norm.custom.apollo_score === 87, "alias normalisation maps Apollo-style names, keeps unknown in custom");

    // Dry run: validates, inserts nothing, logs nothing.
    const before = await svc.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("phone_hash", hash(phone(10)));
    const dry = await deliver(apollo, { query: "?dry_run=1" });
    const dry2 = await deliver(apollo, { headers: { "x-dry-run": "1" } });
    const after = await svc.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("phone_hash", hash(phone(10)));
    check(dry.status === 200 && (dry.json as { dry_run?: boolean; would?: string }).would === "created", "dry run (?dry_run=1) reports it would create", dry);
    check(dry2.status === 200 && (dry2.json as { dry_run?: boolean }).dry_run === true, "dry run (X-Dry-Run header) works");
    check((before.count ?? 0) === 0 && (after.count ?? 0) === 0, "dry run inserted no lead");
    check((await newEvents()).length === 0, "dry run wrote no delivery-log row");
    check(!JSON.stringify(dry.json).includes(String(phoneBase + 10)), "dry run response masks the phone number");

    const bad = await deliver({ ...apollo, consent: undefined, "Mobile Phone": phone(11) }, {});
    check(bad.status === 400, "missing consent -> 400", bad);
    const noCamp = await deliver({ ...apollo, campaign: "nope-" + tag, "Mobile Phone": phone(12) });
    check(noCamp.status === 400, "unknown campaign -> 400");
    const noTok = await deliver(apollo, { bearer: t.token.slice(0, 10) + "x".repeat(20) });
    check(noTok.status === 401, "wrong token (right prefix) -> 401");
    const noTok2 = await deliver(apollo, { bearer: "lci_totallyunknown" });
    check(noTok2.status === 401, "unknown token -> 401");

    const ok = await deliver(apollo);
    check(ok.status === 201 && typeof ok.json.lead_id === "string", "real delivery -> 201 with lead_id", ok);
    const leadId = ok.json.lead_id as string;
    if (leadId) created.leads.add(leadId);
    const { data: wl } = await svc.from("leads").select("*").eq("id", leadId).single();
    check(
      wl?.source === "apollo" && wl?.screening_status === "pending" && wl?.assigned_to === null && wl?.first_name === "Ada" &&
        wl?.email === "ada.proof@example.com" && wl?.company_name === "Proof Engines" && wl?.job_title === "CTO" && wl?.region === "TX" &&
        wl?.country_code === "US" && wl?.campaign_id === campaignId,
      "webhook lead has mapped fields, source=apollo, pending, unassigned",
      wl && { source: wl.source, screening: wl.screening_status, country: wl.country_code },
    );
    const cu = (wl?.custom ?? {}) as Record<string, unknown>;
    check(cu.apollo_score === 87 && cu.linkedin_url === "https://linkedin.com/in/ada-proof" && typeof cu.consent_text === "string", "unknown + linkedin fields preserved in custom, consent stored");

    const dup = await deliver(apollo);
    check(dup.status === 409, "repeat delivery -> 409 duplicate");
    await svc.from("suppression_list").upsert({ workspace_id: ws, phone_hash: hash(phone(13)), reason: tag });
    created.supp.push(hash(phone(13)));
    const sup = await deliver({ ...apollo, "Mobile Phone": phone(13) });
    check(sup.status === 422, "suppressed number -> 422");
    const zap = await deliver({ campaign_id: campaignId, phone: phone(14), first_name: "Zap", consent: true, consent_text: "Opt-in form (proof)" });
    check(zap.status === 201, "Zapier-style flat payload with campaign_id -> 201");
    if (typeof zap.json.lead_id === "string") created.leads.add(zap.json.lead_id);
    const { data: zl } = await svc.from("leads").select("source").eq("id", zap.json.lead_id as string).single();
    check(zl?.source === "webhook", "source defaults to webhook when none is sent");

    const evs = await newEvents();
    const outcomes = evs.map((e) => e.outcome).sort().join(",");
    check(
      evs.length === 7 && ["created", "created", "duplicate", "invalid", "invalid", "suppressed", "unauthorized"].join(",") === outcomes,
      "delivery log has one row per authenticated delivery (created x2, duplicate, invalid x2, suppressed, unauthorized)",
      outcomes,
    );
    const evText = JSON.stringify(evs);
    check(![10, 11, 13, 14].some((i) => evText.includes(String(phoneBase + i))), "delivery log holds no full phone numbers");
    check(evs.some((e) => e.phone_last4 === String(phoneBase + 10).slice(-4) && e.lead_id === leadId && e.source === "apollo"), "created row carries last 4 digits, lead_id and source");
    const { data: seen } = await lg.c.from("lead_intake_events").select("id").eq("workspace_id", ws).in("id", evs.map((e) => e.id));
    check((seen ?? []).length === evs.length, "lead_gen reads the delivery log");
    const { error: evIns } = await lg.c.from("lead_intake_events").insert({ workspace_id: ws, http_status: 201, outcome: "created" });
    check(!!evIns, "lead_gen cannot forge delivery-log rows");
    const { count: aud } = await svc.from("audit_log").select("id", { count: "exact", head: true }).eq("entity_type", "lead_intake_event").eq("workspace_id", ws);
    check((aud ?? 0) > 0, "audit trigger records delivery-log rows");
    const { data: agEv } = await agent.c.from("lead_intake_events").select("id").eq("workspace_id", ws);
    check((agEv ?? []).length === 0, "agent cannot read the delivery log");

    // =============================================================
    console.log("\n5. Hand-off to sales agents");
    const agentId = agent.profile.id;
    const { data: r1, error: r1e } = await lg.c.rpc("leadgen_assign_leads", { p_lead_ids: [l1!.id, leadId], p_campaign_id: campaignId, p_agent_id: agentId });
    check(!r1e && (r1 as { assigned?: number })?.assigned === 2, "assign two leads to a specific agent", r1e?.message ?? r1);
    const { data: myLeads } = await agent.c.from("leads").select("id, status, assigned_to").eq("assigned_to", agentId).in("id", [l1!.id, leadId]);
    check((myLeads ?? []).length === 2 && myLeads!.every((r) => r.status === "assigned"), "agent sees both in My leads (assigned_to = agent, status assigned)");
    const { data: stillPending } = await svc.from("leads").select("screening_status, screened_at").in("id", [l1!.id, leadId]);
    check((stillPending ?? []).every((r) => r.screening_status === "pending" && r.screened_at === null), "hand-off leaves screening untouched: the leads stay pending, so next_lead_for_agent (needs 'passed') still cannot serve them");
    const { data: sees } = await lg.c.from("leads").select("id, assigned_by").in("id", [l1!.id, leadId]);
    check((sees ?? []).length === 2 && sees!.every((r) => r.assigned_by === lg.profile.id), "lead_gen still sees leads it handed off (assigned_by)");

    const foreign = await svc.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(20), first_name: "Owned", assigned_to: agentId }).select("id").single();
    if (foreign.data) created.leads.add(foreign.data.id);
    const { data: hidden } = await lg.c.from("leads").select("id").eq("id", foreign.data!.id);
    check((hidden ?? []).length === 0, "lead_gen cannot read a lead assigned by someone else and not sourced by them");
    const { data: r2 } = await lg.c.rpc("leadgen_assign_leads", { p_lead_ids: [foreign.data!.id], p_campaign_id: campaignId, p_agent_id: agentId });
    check((r2 as { assigned?: number })?.assigned === 0, "...and cannot reassign it either");

    const { data: other } = await svc.from("workspaces").select("id").neq("id", ws).limit(1);
    if (other?.[0]) {
      const alienIns = await svc.from("leads").insert({ workspace_id: other[0].id, phone_e164: phone(40), first_name: "Alien" }).select("id").single();
      const alienId = alienIns.data?.id;
      if (alienId) {
        created.leads.add(alienId);
        const { data: r3 } = await lg.c.rpc("leadgen_assign_leads", { p_lead_ids: [alienId], p_campaign_id: campaignId, p_agent_id: agentId });
        check((r3 as { assigned?: number })?.assigned === 0, "cross-workspace lead id is ignored by the hand-off RPC");
        const { data: alienRead } = await lg.c.from("leads").select("id").eq("id", alienId);
        check((alienRead ?? []).length === 0, "cross-workspace lead is invisible to lead_gen");
      } else check(false, "could not create the cross-workspace fixture", alienIns.error?.message);
    }

    // round-robin over the two imported leads + zap lead (unassigned)
    const rrIds = [...(impRows ?? []).map((r) => r.id), zap.json.lead_id as string];
    const { data: rr, error: rre } = await lg.c.rpc("leadgen_auto_assign", { p_campaign_id: campaignId, p_lead_ids: rrIds });
    check(!rre && (rr as { assigned?: number })?.assigned === 3, "round-robin assigns all selected unassigned leads", rre?.message ?? rr);
    const { data: rrRows } = await svc.from("leads").select("assigned_to").in("id", rrIds);
    const per = new Map<string, number>();
    for (const r of rrRows ?? []) per.set(r.assigned_to!, (per.get(r.assigned_to!) ?? 0) + 1);
    const counts = [...per.values()];
    check((rrRows ?? []).every((r) => !!r.assigned_to) && (agents ?? []).length > 0, "round-robin gave every lead an owner from the roster");
    if ((agents ?? []).length > 1) check(Math.max(...counts) - Math.min(...counts) <= 1, "round-robin is balanced across rostered agents", counts);

    await svc.from("suppression_list").upsert({ workspace_id: ws, phone_hash: hash(phone(21)), reason: tag });
    created.supp.push(hash(phone(21)));
    const sl = await svc.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(21), first_name: "Supp", created_by: lg.profile.id }).select("id").single();
    if (sl.data) created.leads.add(sl.data.id);
    const { data: r4 } = await lg.c.rpc("leadgen_assign_leads", { p_lead_ids: [sl.data!.id], p_campaign_id: campaignId, p_agent_id: agentId });
    check((r4 as { assigned?: number })?.assigned === 0, "suppressed numbers are never handed out");

    const { error: r5e } = await svc.from("campaign_assignments").delete().eq("campaign_id", campaignId).eq("user_id", agentId).then((x) => x);
    void r5e;
    const fresh = await lg.c.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(22), first_name: "Roster" }).select("id").single();
    if (fresh.data) created.leads.add(fresh.data.id);
    const { error: r5 } = await lg.c.rpc("leadgen_assign_leads", { p_lead_ids: [fresh.data!.id], p_campaign_id: campaignId, p_agent_id: agentId });
    check(!!r5 && /roster/.test(r5.message), "agent not on the campaign roster is refused", r5?.message);

    // =============================================================
    console.log("\n6. RLS denials for lead_gen (reads)");
    const denied: [string, string][] = [
      ["calls", "recordings / calls"],
      ["call_transfers", "call_transfers"],
      ["callbacks", "callbacks"],
      ["dispositions", "dispositions"],
      ["qa_templates", "qa_templates"],
      ["qa_criteria", "qa_criteria"],
      ["qa_scores", "qa_scores"],
      ["qa_criterion_results", "qa_criterion_results"],
      ["attendance_events", "attendance_events"],
      ["shifts", "shifts"],
      ["shift_assignments", "shift_assignments"],
      ["leave_requests", "leave_requests"],
      ["audit_log", "audit_log"],
      ["credential_events", "credential_events"],
      ["twilio_credentials", "twilio_credentials"],
      ["twilio_numbers", "twilio_numbers"],
      ["campaigns", "campaigns (direct; names come from the RPC)"],
      ["campaign_assignments", "campaign_assignments (rosters)"],
      ["suppression_list", "suppression_list"],
      ["email_log", "email_log"],
      ["email_templates", "email_templates"],
      ["clients", "clients"],
      ["platform_admins", "platform_admins"],
    ];
    for (const [table, label] of denied) {
      const real = await svc.from(table as never).select("*", { count: "exact", head: true });
      const r = await lg.c.from(table as never).select("*").limit(5);
      const rows = (r.data ?? []) as unknown[];
      check(rows.length === 0, `${label}: lead_gen reads 0 rows${(real.count ?? 0) > 0 ? ` (table has ${real.count})` : " (table is empty: not a meaningful proof)"}`, r.error?.message ?? `${rows.length} rows`);
    }
    // call attempts: stored on calls / dispositions; also check recordings exposure columns
    const { data: profs } = await lg.c.from("profiles").select("id");
    check((profs ?? []).length === 1 && profs![0].id === lg.profile.id, "profiles: lead_gen sees only its own row");
    const { data: lgBatches } = await lg.c.from("lead_batches").select("id, uploaded_by");
    check((lgBatches ?? []).every((b) => b.uploaded_by === lg.profile.id), "lead_batches: only its own batches");
    const { data: lgRuns } = await lg.c.from("source_fetch_runs").select("id, triggered_by");
    check((lgRuns ?? []).every((b) => b.triggered_by === lg.profile.id), "source_fetch_runs: only its own runs");
    const { data: ws2 } = await lg.c.from("workspaces").select("id");
    check((ws2 ?? []).length === 1, "workspaces: only its own workspace row");

    console.log("\n7. RLS denials for lead_gen (writes) and the compliance gate");
    const mine = l1!.id;
    const u1 = await lg.c.from("leads").update({ screening_status: "passed" }).eq("id", mine).select("id");
    check((u1.data ?? []).length === 0, "lead_gen cannot self-screen a lead (update leads)", u1.error?.message ?? "updated");
    const u2 = await lg.c.from("leads").update({ assigned_to: agentId }).eq("id", fresh.data!.id).select("id");
    check((u2.data ?? []).length === 0, "lead_gen cannot assign by direct update");
    const d1 = await lg.c.from("leads").delete().eq("id", mine).select("id");
    check((d1.data ?? []).length === 0, "lead_gen cannot delete leads");
    const i1 = await lg.c.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(30), screening_status: "passed" });
    check(!!i1.error, "lead_gen cannot insert an already-screened lead", i1.error?.message);
    const i2 = await lg.c.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(31), assigned_to: agentId });
    check(!!i2.error, "lead_gen cannot insert a pre-assigned lead");
    const i3 = await lg.c.from("leads").insert({ workspace_id: ws, campaign_id: campaignId, phone_e164: phone(32), created_by: agentId });
    check(!!i3.error, "lead_gen cannot forge created_by");
    const i4 = await lg.c.from("suppression_list").insert({ workspace_id: ws, phone_hash: hash(phone(33)), reason: "x" });
    check(!!i4.error, "lead_gen cannot write the suppression list");
    const i5 = await lg.c.from("campaigns").insert({ workspace_id: ws, name: "nope" });
    check(!!i5.error, "lead_gen cannot create campaigns");
    const u3 = await lg.c.from("data_sources").update({ is_active: false }).eq("id", src.id).select("id");
    check((u3.data ?? []).length === 0, "lead_gen cannot edit/deactivate a data source");
    const u4 = await lg.c.from("profiles").update({ role: "super_admin" }).eq("id", lg.profile.id).select("id");
    const { data: roleNow } = await svc.from("profiles").select("role").eq("id", lg.profile.id).single();
    check(roleNow?.role === "lead_gen", "lead_gen cannot self-escalate role", u4.error?.message);
    for (const [fn, args] of [
      ["screen_leads", { p_lead_ids: [mine] }],
      ["auto_assign_campaign_leads", { p_campaign_id: campaignId }],
      ["remove_agent_from_campaign", { p_campaign_id: campaignId, p_user_id: agentId }],
    ] as const) {
      const r = await lg.c.rpc(fn as never, args as never);
      check(!!r.error, `lead_gen cannot call manager RPC ${fn}`, r.error?.message);
    }
    const dialReq = await lg.c.rpc("next_lead_for_agent", { p_agent_id: agentId });
    check(!dialReq.data?.id, "lead_gen cannot pull leads from the dial queue", dialReq.error?.message);
    const { data: repAfter } = await svc.from("leads").select("screening_status").eq("id", mine).single();
    check(repAfter?.screening_status === "pending", "the lead is still pending after all of that");

    console.log("\n8. Other roles");
    for (const [name, c] of [["agent", agent.c]] as const) {
      const r = await c.rpc("leadgen_assign_leads", { p_lead_ids: [mine], p_campaign_id: campaignId, p_agent_id: agentId });
      check(!!r.error, `${name} cannot call leadgen_assign_leads`, r.error?.message);
      const r2 = await c.rpc("leadgen_dashboard_stats", { p_days: 14 });
      check(!!r2.error, `${name} cannot call leadgen_dashboard_stats`);
    }
    const { data: agTok } = await agent.c.from("lead_intake_tokens").select("id").eq("workspace_id", ws);
    check((agTok ?? []).length === 0, "agent cannot read the webhook token row");
    const { data: opsStats, error: opsErr } = await ops.c.rpc("leadgen_dashboard_stats", { p_days: 14 });
    check(!opsErr && !!opsStats, "ops manager can use the same aggregate RPC", opsErr?.message);
    const { data: opsEvents } = await ops.c.from("lead_intake_events").select("id").eq("workspace_id", ws).limit(1);
    check((opsEvents ?? []).length === 1, "ops manager reads the delivery log");
    const { data: seat } = await svc.from("profiles").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("role", "agent").eq("is_active", true);
    void seat;
    void inboxLeadIds;
  } finally {
    console.log("\nCleaning up");
    const ids = [...created.leads];
    if (ids.length) {
      await svc.from("lead_intake_events").update({ lead_id: null }).in("lead_id", ids);
      await svc.from("unphoned_contacts").update({ promoted_lead_id: null }).in("promoted_lead_id", ids);
      await svc.from("leads").delete().in("id", ids);
    }
    if (campaignId) await svc.from("leads").delete().eq("campaign_id", campaignId);
    if (created.unphoned.length) await svc.from("unphoned_contacts").delete().in("id", created.unphoned);
    if (created.runs.length) await svc.from("source_fetch_runs").delete().in("id", created.runs);
    if (created.batches.length) await svc.from("lead_batches").delete().in("id", created.batches);
    if (created.sources.length) await svc.from("data_sources").delete().in("id", created.sources);
    if (created.paths.length) await svc.storage.from("lead-uploads").remove(created.paths);
    if (created.supp.length) await svc.from("suppression_list").delete().eq("workspace_id", ws).in("phone_hash", created.supp);
    // Delivery-log rows this run wrote (identified by not being in the baseline).
    const { data: allEv } = await svc.from("lead_intake_events").select("id").eq("workspace_id", ws).gte("received_at", startedAt);
    const mineEv = (allEv ?? []).filter((e) => !eventBaseline.has(e.id)).map((e) => e.id);
    if (mineEv.length) await svc.from("lead_intake_events").delete().in("id", mineEv);
    if (campaignId) {
      await svc.from("campaign_assignments").delete().eq("campaign_id", campaignId);
      await svc.from("campaigns").delete().eq("id", campaignId);
    }
    if (tokenBackup) {
      await svc.from("lead_intake_tokens").upsert(tokenBackup, { onConflict: "workspace_id" });
    } else {
      await svc.from("lead_intake_tokens").delete().eq("workspace_id", ws);
    }
    void tag;
  }

  console.log(failures ? `\n${failures} check(s) FAILED.` : "\nAll lead-gen checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
