// `npm run test:import` (tsx --conditions=react-server scripts/import-proof.ts).
//
// Proves the mapped lead importer (src/lib/leads/mapped-import.ts) against the
// live database, calling the library directly (no Next): header auto-suggest,
// required-mapping validation, first+last combine, optional targets (contact,
// website, campaign column, notes, next step, appointment, last contact), date
// parsing, extra columns -> leads.custom, phone normalisation with the
// campaign's country, invalid / duplicate / existing / suppressed handling,
// dry run saves nothing, the real import, "I will call these myself" (assign +
// roster), "Run screening now" making leads dialable for the admin through
// next_lead_for_agent, role limits (lead_gen / agent), update_my_lead's new
// fields, and cross-workspace isolation.
//
// It runs in the throwaway workspace "ZZ Signup Test Co" (a non-demo workspace,
// so the demo allow-list does not block dialling): its status is set to
// 'active' for the run and back to what it was afterwards. Workspaces are
// never created or deleted. Temp users, campaigns, leads and batches it makes
// are removed by id at the end.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD } from "@/lib/seed/personas";

// tsx quirk (same as leadgen-proof.ts): libphonenumber-js' CJS build requires
// metadata.min.json and tsx resolves it to an ES module. Pin the .json file.
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
const ZZ_PASSWORD = "Testing#12345";

let failures = 0;
const check = (c: boolean, label: string, detail?: unknown) => {
  if (c) console.log(`  ok    ${label}`);
  else {
    console.error(`  FAIL  ${label}${detail !== undefined ? ` - ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    failures++;
  }
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function signIn(email: string, password: string) {
  const c: SupabaseClient<RealDatabase> = createClient<RealDatabase>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`sign-in ${email}: ${error?.message}`);
  const { data: p } = await c.from("profiles").select("*").eq("id", data.user.id).single();
  return { c, profile: p! };
}

const csv = (rows: string[][]) =>
  Buffer.from(rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n"));

async function main() {
  const lib = await import("@/lib/leads/mapped-import");
  const shared = await import("@/lib/leads/mapped-import-shared");
  const { buildPlan, runMappedImport, parseTabular, parseDateTime, loadCampaigns, ImportError } = lib;
  const { suggestMapping, validateMapping } = shared;

  // ------------------------------------------------------------- 1. pure
  console.log("\n1. Header auto-suggest");
  const h1 = ["Contact Person", "Mobile", "Business", "E-mail Address", "Website URL", "Notes", "Next Step", "Follow-up Date", "Last Contacted", "Campaign", "Region"];
  const s1 = suggestMapping(h1);
  check(JSON.stringify(s1.name) === JSON.stringify({ column: "Contact Person" }), "'Contact Person' -> Name", s1.name);
  check(JSON.stringify(s1.phone) === JSON.stringify({ column: "Mobile" }), "'Mobile' -> Phone number", s1.phone);
  check(JSON.stringify(s1.company) === JSON.stringify({ column: "Business" }), "'Business' -> Company", s1.company);
  check(JSON.stringify(s1.email) === JSON.stringify({ column: "E-mail Address" }), "'E-mail Address' -> Email", s1.email);
  check(JSON.stringify([s1.website, s1.notes, s1.nextStep, s1.appointment, s1.lastContact, s1.campaign]) ===
    JSON.stringify([{ column: "Website URL" }, { column: "Notes" }, { column: "Next Step" }, { column: "Follow-up Date" }, { column: "Last Contacted" }, { column: "Campaign" }]),
    "optional targets suggested (website, notes, next step, appointment, last contact, campaign)", s1);
  check(s1.contact === undefined, "no contact-person guess when 'Contact Person' is already the name");
  const s2 = suggestMapping(["First Name", "Surname", "Telephone", "Company Name", "Email"]);
  check(JSON.stringify(s2.name) === JSON.stringify({ first: "First Name", last: "Surname" }), "first + last name columns -> combine", s2.name);
  check(JSON.stringify(s2.phone) === JSON.stringify({ column: "Telephone" }) && JSON.stringify(s2.company) === JSON.stringify({ column: "Company Name" }), "Telephone / Company Name guessed");
  const s3 = suggestMapping(["Full Name", "Phone Number", "Organisation", "Email Address"]);
  check(JSON.stringify([s3.name, s3.phone, s3.company, s3.email]) === JSON.stringify([{ column: "Full Name" }, { column: "Phone Number" }, { column: "Organisation" }, { column: "Email Address" }]), "plain headers guessed");

  console.log("\n2. Required-mapping validation");
  const H = ["a", "b", "c", "d"];
  check(!validateMapping(H, {}).ok, "empty mapping rejected");
  const noPhone = validateMapping(H, { name: { column: "a" }, company: { none: true }, email: { none: true } });
  check(!noPhone.ok && !!noPhone.errors.phone, "phone must be chosen", noPhone.errors);
  const phoneNone = validateMapping(H, { name: { column: "a" }, phone: { none: true } as never, company: { none: true }, email: { none: true } });
  check(!phoneNone.ok && !!phoneNone.errors.phone, "phone can never be skipped (explicit 'none' rejected)");
  const undecided = validateMapping(H, { phone: { column: "b" } });
  check(!undecided.ok && !!undecided.errors.name && !!undecided.errors.company && !!undecided.errors.email, "name, company and email must each be chosen or explicitly declined", undecided.errors);
  check(validateMapping(H, { phone: { column: "b" }, name: { none: true }, company: { none: true }, email: { none: true } }).ok, "explicitly declining name/company/email is accepted");
  check(!validateMapping(H, { phone: { column: "zzz" }, name: { none: true }, company: { none: true }, email: { none: true } }).ok, "unknown column rejected");
  check(!validateMapping(H, { phone: { column: "b" }, name: { first: "a", last: "a" }, company: { none: true }, email: { none: true } }).ok, "first and last must differ");
  check(!validateMapping(H, { phone: { column: "b" }, name: { none: true }, company: { none: true }, email: { none: true }, appointment: { column: "nope" } }).ok, "optional field with unknown column rejected");

  console.log("\n3. Date parsing");
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  check(iso(parseDateTime("2026-03-04 14:30", "GB", "Europe/London")) === "2026-03-04T14:30:00.000Z", "ISO date-time in winter London = UTC");
  check(iso(parseDateTime("2026-07-04 14:30", "GB", "Europe/London")) === "2026-07-04T13:30:00.000Z", "ISO date-time in summer London = UTC-1h (BST)");
  check(iso(parseDateTime("2026-03-04T14:30:00Z", "GB", "Europe/London")) === "2026-03-04T14:30:00.000Z", "explicit Z wins over campaign timezone");
  check(iso(parseDateTime("04/03/2026", "GB", null)) === "2026-03-04T00:00:00.000Z", "04/03/2026 is 4 March for a GB campaign");
  check(iso(parseDateTime("04/03/2026", "US", null)) === "2026-04-03T00:00:00.000Z", "04/03/2026 is 3 April for a US campaign");
  check(iso(parseDateTime("25/12/2026 9:05", "GB", null)) === "2026-12-25T09:05:00.000Z", "day-first with time");
  check(iso(parseDateTime("4 Mar 2026 2:30pm", "GB", null)) === "2026-03-04T14:30:00.000Z", "'4 Mar 2026 2:30pm'");
  check(iso(parseDateTime("March 4, 2026", "US", null)) === "2026-03-04T00:00:00.000Z", "'March 4, 2026'");
  check(iso(parseDateTime("46085", "GB", null)) === "2026-03-04T00:00:00.000Z", "Excel serial number", iso(parseDateTime("46085", "GB", null)));
  check(parseDateTime("next tuesday-ish", "GB", null) === null && parseDateTime("31/02/2026", "GB", null) === null && parseDateTime("2026-13-01", "GB", null) === null, "garbage and impossible dates are rejected");

  console.log("\n4. File parsing and limits");
  const lead0 = parseTabular(csv([["Name", "Phone"], ["Z", "07700 900123"]]), "x.csv");
  check(lead0.rows[0][1] === "07700 900123", "CSV cell text is kept as written");
  const lead0b = parseTabular(csv([["Name", "Phone"], ["Z", "07700900123"]]), "x.csv");
  check(lead0b.rows[0][1] === "07700900123", "leading zero survives in a CSV", lead0b.rows[0]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Name", ""], ["A", "B", "C"]]), "S");
  const xl = parseTabular(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, "x.xlsx");
  check(xl.headers.join("|") === "Name|Name (2)|Column 3", "xlsx parsed; duplicate/blank headers made unique", xl.headers);
  const expectErr = (fn: () => unknown, label: string) => {
    try {
      fn();
      check(false, label);
    } catch (e) {
      check(e instanceof ImportError, label, e instanceof Error ? e.message : String(e));
    }
  };
  expectErr(() => parseTabular(Buffer.alloc(10 * 1024 * 1024 + 1, 97), "big.csv"), "file over 10 MB rejected with a clear error");
  expectErr(() => parseTabular(csv([["P"], ...Array.from({ length: 20001 }, (_, i) => [String(i)])]), "many.csv"), "more than 20,000 rows rejected");
  expectErr(() => parseTabular(Buffer.from("hello"), "notes.txt"), "wrong extension rejected");
  expectErr(() => parseTabular(Buffer.from("Name,Phone\n"), "empty.csv"), "header-only file rejected");

  // --------------------------------------------------------- 2. live DB
  const { data: zzProfile } = await svc.from("profiles").select("id, email, workspace_id").like("email", "zz-signup-%").limit(1).single();
  if (!zzProfile) throw new Error("ZZ Signup Test Co owner not found");
  const wsId = zzProfile.workspace_id;
  const { data: wsRow } = await svc.from("workspaces").select("status, is_demo").eq("id", wsId).single();
  if (!wsRow || wsRow.is_demo) throw new Error("expected a non-demo ZZ workspace");
  const originalStatus = wsRow.status;
  await svc.from("workspaces").update({ status: "active" }).eq("id", wsId);

  const tag = `impproof-${Date.now()}`;
  const stamp = String(Date.now()).slice(-5);
  const gb = (n: number) => `07700 9${stamp.slice(0, 3)}${String(n).padStart(2, "0")}`; // local GB format
  const gbE164 = (n: number) => `+447700${`9${stamp.slice(0, 3)}${String(n).padStart(2, "0")}`}`;
  const us = (n: number) => `(415) 555-${String((Number(stamp) % 90) + 10).padStart(2, "0")}${String(n).padStart(2, "0")}`;
  const usE164 = (n: number) => `+1415555${String((Number(stamp) % 90) + 10).padStart(2, "0")}${String(n).padStart(2, "0")}`;

  const created = {
    users: [] as string[],
    campaigns: [] as string[],
    batches: [] as string[],
    leads: [] as string[],
    clients: [] as string[],
    supp: [] as string[],
    paths: [] as string[],
  };

  try {
    const own = await signIn(zzProfile.email, ZZ_PASSWORD);
    const ctxOwn = { supabase: own.c, workspaceId: wsId, userId: own.profile.id, role: own.profile.role as string };
    check(own.profile.role === "super_admin", "ZZ owner is a super_admin");

    // temp users in the ZZ workspace
    const mkUser = async (role: "agent" | "lead_gen" | "qa_analyst") => {
      const email = `${tag}-${role}@leadcallient.demo`;
      const { data: u, error } = await svc.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
      if (error || !u.user) throw new Error(`temp ${role}: ${error?.message}`);
      created.users.push(u.user.id);
      const { error: pe } = await svc.from("profiles").insert({ id: u.user.id, workspace_id: wsId, email, full_name: `Proof ${role}`, role, must_change_password: false });
      if (pe) throw new Error(`temp ${role} profile: ${pe.message}`);
      return { id: u.user.id, ...(await signIn(email, DEMO_PASSWORD)) };
    };
    const ag = await mkUser("agent");
    const lg = await mkUser("lead_gen");
    const ctxAg = { supabase: ag.c, workspaceId: wsId, userId: ag.id, role: "agent" };
    const ctxLg = { supabase: lg.c, workspaceId: wsId, userId: lg.id, role: "lead_gen" };

    const { data: client, error: cErr } = await svc.from("clients").insert({ workspace_id: wsId, name: `${tag} client` }).select("id").single();
    if (cErr || !client) throw new Error(`client: ${cErr?.message}`);
    created.clients.push(client.id);
    const mkCampaign = async (name: string, country: string, timezone: string) => {
      const { data, error } = await svc
        .from("campaigns")
        .insert({ workspace_id: wsId, client_id: client.id, name, country, timezone, status: "active" })
        .select("id")
        .single();
      if (error || !data) throw new Error(`campaign ${name}: ${error?.message}`);
      created.campaigns.push(data.id);
      return data.id;
    };
    const campA = await mkCampaign(`${tag} D&P Appointments`, "GB", "Europe/London");
    const campB = await mkCampaign(`${tag} D&P Close`, "US", "America/New_York");
    const trackBatch = (b: string) => b && created.batches.push(b);
    const leadsOf = async (batchId: string) => {
      const { data } = await svc.from("leads").select("*").eq("batch_id", batchId);
      for (const l of data ?? []) created.leads.push(l.id);
      return data ?? [];
    };
    const countLeads = async () => (await svc.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count ?? 0;
    const countBatches = async () => (await svc.from("lead_batches").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count ?? 0;

    // fixtures the importer must respect
    const existingPhone = gbE164(50);
    const suppressedPhone = gbE164(51);
    const { data: exLead, error: exErr } = await svc
      .from("leads")
      .insert({ workspace_id: wsId, campaign_id: campA, phone_e164: existingPhone, full_name: "Already Here", source: "proof" })
      .select("id")
      .single();
    if (exErr || !exLead) throw new Error(`existing lead: ${exErr?.message}`);
    created.leads.push(exLead.id);
    const { data: sp, error: spErr } = await svc
      .from("suppression_list")
      .insert({ workspace_id: wsId, phone_hash: sha(suppressedPhone), reason: "proof" })
      .select("id")
      .single();
    if (spErr || !sp) throw new Error(`suppression: ${spErr?.message}`);
    created.supp.push(sp.id);

    const campaigns = await loadCampaigns(ctxOwn);
    check(campaigns.some((c) => c.id === campA) && campaigns.some((c) => c.id === campB), "loadCampaigns lists the workspace's campaigns");

    console.log("\n5. Plan (dry run) with the full mapping");
    const header = ["Contact Person", "Mobile", "Business", "E-mail Address", "Website URL", "Notes", "Next Step", "Follow-up Date", "Last Contacted", "Region", "Account Manager"];
    const rows = [
      header,
      ["Alice Adams", gb(1), "Acme Ltd", "alice@acme.test", "acme.test", "Call after 5", "Send brochure", "2026-03-04 14:30", "01/02/2026", "North", "Bob"],
      ["Bob  Brown", gbE164(2), "Brown & Co", "bob@brown.test", "", "", "", "", "", "South", ""],
      ["Bad Number", "12", "Nope Ltd", "", "", "", "", "", "", "", ""],
      ["Dupe Of Alice", gb(1), "Acme Again", "", "", "", "", "", "", "", ""],
      ["Existing", existingPhone, "Here Ltd", "", "", "", "", "", "", "", ""],
      ["Suppressed", suppressedPhone, "DNC Ltd", "", "", "", "", "", "", "", ""],
      ["Bad Email Date", gb(3), "Messy Ltd", "not-an-email", "", "", "", "next tuesday-ish", "", "East", ""],
      ["No Phone", "", "Void Ltd", "v@void.test", "", "", "", "", "", "", ""],
    ];
    const file1 = csv(rows);
    const parsed1 = parseTabular(file1, "leads.csv");
    const fullMap = {
      name: { column: "Contact Person" },
      phone: { column: "Mobile" },
      company: { column: "Business" },
      email: { column: "E-mail Address" },
      website: { column: "Website URL" },
      notes: { column: "Notes" },
      nextStep: { column: "Next Step" },
      appointment: { column: "Follow-up Date" },
      lastContact: { column: "Last Contacted" },
      keepExtra: true,
    };
    const beforeLeads = await countLeads();
    const beforeBatches = await countBatches();
    const plan1 = await buildPlan(ctxOwn, { parsed: parsed1, mapping: fullMap, campaigns, defaultCampaignId: campA, timezone: "Europe/London" });
    const p = plan1.preview;
    check(p.totalRows === 8, "8 data rows read", p.totalRows);
    check(p.willImport === 3, "3 rows will be imported (Alice, Bob, Bad Email Date)", p.willImport);
    check(p.invalidCount === 2 && p.invalid.some((i) => i.row === 4 && /short|possible/i.test(i.reason)) && p.invalid.some((i) => i.row === 9), "2 invalid numbers listed with row numbers and reasons", p.invalid);
    check(p.duplicatesInFileCount === 1 && p.duplicatesInFile[0].row === 5 && /row 2/.test(p.duplicatesInFile[0].reason), "duplicate inside the file found (row 5 = row 2)", p.duplicatesInFile);
    check(p.alreadyInWorkspace === 1, "number already in the workspace counted");
    check(p.suppressed === 1, "suppressed number counted (and skipped)");
    check(p.ignoredEmails === 1, "an invalid email address is ignored, not fatal");
    check(p.invalidDateCount === 1 && p.invalidDates[0].row === 8, "unreadable date listed with its row", p.invalidDates);
    check(p.extraColumns.join(",") === "Region,Account Manager", "unmapped columns are the extra information", p.extraColumns);
    check(p.sample[0].phone === gbE164(1) && p.sample[0].name === "Alice Adams" && p.sample[0].company === "Acme Ltd", "sample shows cleaned E.164 + mapped fields", p.sample[0]);
    check(p.sample[1].name === "Bob Brown", "whitespace in names is collapsed");
    check(p.sample[0].appointment === "2026-03-04T14:30:00.000Z", "appointment parsed (winter London)", p.sample[0].appointment);
    check((await countLeads()) === beforeLeads && (await countBatches()) === beforeBatches, "dry run saved nothing (no leads, no batch)");

    console.log("\n6. Real import (no options)");
    const res1 = await runMappedImport(ctxOwn, { parsed: parsed1, mapping: fullMap, campaigns, defaultCampaignId: campA, timezone: "Europe/London", filename: "leads.csv", fileBytes: file1, contentType: "text/csv", plan: plan1 });
    trackBatch(res1.batchId);
    const l1 = await leadsOf(res1.batchId);
    check(res1.imported === 3 && l1.length === 3, "batch created with 3 leads", l1.length);
    const { data: b1 } = await svc.from("lead_batches").select("*").eq("id", res1.batchId).single();
    check(b1?.campaign_id === campA && b1?.row_count === 3 && b1?.uploaded_by === own.profile.id, "lead_batches row has campaign, row_count, uploader");
    if (b1?.storage_path) created.paths.push(b1.storage_path);
    const alice = l1.find((l) => l.phone_e164 === gbE164(1));
    check(!!alice && alice.full_name === "Alice Adams" && alice.company_name === "Acme Ltd" && alice.email === "alice@acme.test", "mapped name/phone/company/email saved", alice);
    check(alice?.website === "acme.test" && alice?.agent_notes === "Call after 5" && alice?.next_step === "Send brochure", "website, notes and next step saved");
    check(alice?.appointment_at === "2026-03-04T14:30:00+00:00" && !!alice?.last_contact_at?.startsWith("2026-02-01"), "appointment and last contact saved as timestamptz", [alice?.appointment_at, alice?.last_contact_at]);
    check(JSON.stringify(alice?.custom) === JSON.stringify({ Region: "North", "Account Manager": "Bob" }), "other columns saved in leads.custom", alice?.custom);
    const messy = l1.find((l) => l.phone_e164 === gbE164(3));
    check(messy?.email === null && messy?.appointment_at === null && (messy?.custom as Record<string, string>)?.["Follow-up Date"] === "next tuesday-ish", "bad email left empty; unreadable date kept as extra info, not lost", messy);
    check(l1.every((l) => l.source === "upload" && l.screening_status === "pending" && l.assigned_to === null && l.campaign_id === campA && l.batch_id === res1.batchId), "source 'upload', screening pending, unassigned, right campaign/batch");
    check(l1.every((l) => l.phone_hash === sha(l.phone_e164!)), "phone_hash is sha256 of the E.164 number (same as the other paths)");
    check(!l1.some((l) => l.phone_e164 === suppressedPhone), "the suppressed number was not imported");

    console.log("\n7. keepExtra off; first+last combine; company/email declined; US country");
    const rowsUs = [
      ["First", "Last", "Cell", "Misc"],
      ["Ann", "Lee", us(1), "m1"],
      ["Cy", "Dunn", us(2), "m2"],
    ];
    const fileUs = csv(rowsUs);
    const planUs = await buildPlan(ctxOwn, {
      parsed: parseTabular(fileUs, "us.csv"),
      mapping: { name: { first: "First", last: "Last" }, phone: { column: "Cell" }, company: { none: true }, email: { none: true }, keepExtra: false },
      campaigns,
      defaultCampaignId: campB,
    });
    check(planUs.toImport.length === 2 && planUs.toImport[0].name === "Ann Lee", "first + last combined into one name", planUs.toImport[0]);
    check(planUs.toImport[0].phone === usE164(1), "US-format number normalised with the campaign's country (US)", planUs.toImport[0].phone);
    check(planUs.toImport[0].company === null && planUs.toImport[0].email === null, "declined company/email stay empty");
    check(Object.keys(planUs.toImport[0].custom).length === 0 && planUs.preview.extraColumns.length === 0, "keepExtra off: nothing saved in custom");

    console.log("\n8. Campaign column");
    const rowsC = [
      ["Name", "Tel", "Campaign"],
      ["C One", us(11), ` ${tag}  d&p   close `],
      ["C Two", gb(12), `${tag} D&P Appointments`],
      ["C Three", gb(13), "No Such Campaign"],
      ["C Four", gb(14), ""],
    ];
    const fileC = csv(rowsC);
    const mapC = { name: { column: "Name" }, phone: { column: "Tel" }, company: { none: true as const }, email: { none: true as const }, campaign: { column: "Campaign" } };
    const planC = await buildPlan(ctxOwn, { parsed: parseTabular(fileC, "c.csv"), mapping: mapC, campaigns, defaultCampaignId: campA });
    check(planC.preview.unmatchedCampaignCount === 1 && planC.preview.unmatchedCampaigns[0].row === 4, "unmatched campaign name listed as an error (row 4)", planC.preview.unmatchedCampaigns);
    check(planC.preview.willImport === 3, "unmatched row skipped by default (3 imported)", planC.preview.willImport);
    const c1 = planC.toImport.find((t) => t.name === "C One");
    check(c1?.campaignId === campB && c1.phone === usE164(11), "name matched case-insensitively with spaces collapsed; phone read in that campaign's country", c1);
    check(planC.toImport.find((t) => t.name === "C Four")?.campaignId === campA, "blank campaign cell uses the step-1 campaign");
    const planCfb = await buildPlan(ctxOwn, { parsed: parseTabular(fileC, "c.csv"), mapping: { ...mapC, fallbackToDefault: true }, campaigns, defaultCampaignId: campA });
    check(planCfb.preview.willImport === 4 && planCfb.preview.unmatchedCampaignCount === 0, "with the fallback ticked the unknown name goes to the step-1 campaign");
    const resC = await runMappedImport(ctxOwn, { parsed: parseTabular(fileC, "c.csv"), mapping: mapC, campaigns, defaultCampaignId: campA, filename: "c.csv", fileBytes: fileC });
    trackBatch(resC.batchId);
    const lC = await leadsOf(resC.batchId);
    const [nA, nB] = [lC.filter((l) => l.campaign_id === campA).length, lC.filter((l) => l.campaign_id === campB).length];
    check(lC.length === 3 && nA === 2 && nB === 1, "leads landed in their own campaigns (2 + 1)", { nA, nB });
    const { data: b2 } = await svc.from("lead_batches").select("storage_path").eq("id", resC.batchId).single();
    if (b2?.storage_path) created.paths.push(b2.storage_path);

    console.log("\n9. 'I will call these myself' then screening -> dialable for the admin only");
    const fileM = csv([["Name", "Phone"], ["Mine One", gb(21)], ["Mine Two", gb(22)]]);
    const mapM = { name: { column: "Name" }, phone: { column: "Phone" }, company: { none: true as const }, email: { none: true as const } };
    // agent on the same campaign, to prove they are never served the admin's leads
    const { error: agRoster } = await svc.from("campaign_assignments").insert({ workspace_id: wsId, campaign_id: campA, user_id: ag.id });
    check(!agRoster, "agent put on campaign A's roster", agRoster?.message);
    const resM = await runMappedImport(ctxOwn, { parsed: parseTabular(fileM, "m.csv"), mapping: mapM, campaigns, defaultCampaignId: campA, filename: "m.csv", fileBytes: fileM, callMyself: true });
    trackBatch(resM.batchId);
    const lM = await leadsOf(resM.batchId);
    const { data: b3 } = await svc.from("lead_batches").select("storage_path").eq("id", resM.batchId).single();
    if (b3?.storage_path) created.paths.push(b3.storage_path);
    check(lM.length === 2 && lM.every((l) => l.assigned_to === own.profile.id && l.status === "assigned"), "leads assigned to the uploader", lM.map((l) => l.assigned_to));
    const { data: rost } = await svc.from("campaign_assignments").select("id").eq("campaign_id", campA).eq("user_id", own.profile.id);
    check(resM.rosteredMe && (rost ?? []).length === 1, "uploader is on the campaign roster (migration 99)");
    const pre = await own.c.rpc("next_lead_for_agent", { p_agent_id: own.profile.id });
    check(!pre.data?.id || !lM.some((l) => l.id === pre.data!.id), "pending (unscreened) leads are NOT dialable yet", pre.data?.id);
    if (pre.data?.id) await svc.from("leads").update({ claimed_by: null, claimed_at: null }).eq("id", pre.data.id);
    const resM2 = await own.c.rpc("screen_lead_batch", { p_batch_id: resM.batchId, p_evidence_url: null as unknown as string });
    check(!resM2.error && resM2.data === 2, "manager screens the batch (manual RPC)", resM2.error?.message);
    const mine = await own.c.rpc("next_lead_for_agent", { p_agent_id: own.profile.id });
    check(!!mine.data?.id && lM.some((l) => l.id === mine.data!.id), "after screening the admin is served one of the imported leads", mine.data?.id);
    const theirs = await ag.c.rpc("next_lead_for_agent", { p_agent_id: ag.id });
    check(!theirs.data?.id || !lM.some((l) => l.id === theirs.data!.id), "a rostered agent is never served leads assigned to the admin", theirs.data?.id);
    await svc.from("leads").update({ claimed_by: null, claimed_at: null }).in("id", lM.map((l) => l.id));

    console.log("\n10. 'Run screening now' at import time");
    const fileS = csv([["Name", "Phone"], ["Screen One", gb(31)], ["Screen Two", gb(32)]]);
    const resS = await runMappedImport(ctxOwn, { parsed: parseTabular(fileS, "s.csv"), mapping: mapM, campaigns, defaultCampaignId: campA, filename: "s.csv", fileBytes: fileS, callMyself: true, screenNow: true });
    trackBatch(resS.batchId);
    const lS = await leadsOf(resS.batchId);
    const { data: b4 } = await svc.from("lead_batches").select("storage_path, screened_at").eq("id", resS.batchId).single();
    if (b4?.storage_path) created.paths.push(b4.storage_path);
    check(resS.screened === 2 && lS.every((l) => l.screening_status === "passed" && !!l.screened_at), "screening option marks the new batch passed", lS.map((l) => l.screening_status));
    check(!!b4?.screened_at, "batch screened_at stamped");
    // The queue is oldest-first and each pull claims its lead, so pull until the new leads have been served.
    const served = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const r = await own.c.rpc("next_lead_for_agent", { p_agent_id: own.profile.id });
      if (!r.data?.id) break;
      served.add(r.data.id);
    }
    await svc.from("leads").update({ claimed_by: null, claimed_at: null }).in("id", [...served]);
    check(lS.every((l) => served.has(l.id)), "right after import the admin is served the imported leads", [...served]);
    await svc.from("leads").update({ claimed_by: null, claimed_at: null }).in("id", lS.map((l) => l.id));
    // without the option nothing is screened by the importer
    check(l1.every((l) => l.screening_status === "pending"), "without the option the importer never screens (batch from step 6 still pending)");

    console.log("\n11. Role limits");
    const noOpts = async (ctx: typeof ctxLg, o: { callMyself?: boolean; screenNow?: boolean }) => {
      try {
        await runMappedImport(ctx, { parsed: parseTabular(fileM, "m.csv"), mapping: mapM, campaigns, defaultCampaignId: campA, filename: "m.csv", fileBytes: fileM, ...o });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };
    check(!!(await noOpts(ctxLg, { callMyself: true })), "lead_gen cannot use 'call myself'");
    check(!!(await noOpts(ctxLg, { screenNow: true })), "lead_gen cannot use 'run screening now'");
    check(!!(await noOpts(ctxAg, {})), "an agent cannot import at all");
    const lgRoster = await lg.c.from("campaign_assignments").insert({ workspace_id: wsId, campaign_id: campA, user_id: lg.id });
    check(!!lgRoster.error, "lead_gen cannot put themselves on a roster", lgRoster.error?.message);
    const lgScreen = await lg.c.rpc("screen_lead_batch", { p_batch_id: resM.batchId, p_evidence_url: null as unknown as string });
    check(!!lgScreen.error, "lead_gen cannot call the screening RPC", lgScreen.error?.message);
    const lgSupp = await lg.c.from("suppression_list").select("id");
    check((lgSupp.data ?? []).length === 0, "lead_gen cannot read the suppression list");
    const lgCamps = await loadCampaigns(ctxLg);
    const fileL = csv([["Name", "Phone"], ["LG One", gb(41)], ["LG Dupe Existing", existingPhone], ["LG Suppressed", suppressedPhone]]);
    const planL = await buildPlan(ctxLg, { parsed: parseTabular(fileL, "l.csv"), mapping: mapM, campaigns: lgCamps, defaultCampaignId: campA });
    check(planL.preview.willImport === 1 && planL.preview.alreadyInWorkspace === 1 && planL.preview.suppressed === 1, "lead_gen still gets existing/suppressed counts (hashes only)", planL.preview);
    const resL = await runMappedImport(ctxLg, { parsed: parseTabular(fileL, "l.csv"), mapping: mapM, campaigns: lgCamps, defaultCampaignId: campA, filename: "l.csv", fileBytes: fileL, plan: planL });
    trackBatch(resL.batchId);
    const lL = await leadsOf(resL.batchId);
    const { data: b5 } = await svc.from("lead_batches").select("storage_path").eq("id", resL.batchId).single();
    if (b5?.storage_path) created.paths.push(b5.storage_path);
    check(lL.length === 1 && lL[0].assigned_to === null && lL[0].screening_status === "pending" && lL[0].created_by === lg.id, "lead_gen import: unowned, pending, created_by the lead_gen user");
console.log("\n12. update_my_lead: new fields");
    const mineLead = lM[0];
    await svc.from("leads").update({ assigned_to: ag.id }).eq("id", mineLead.id);
    const upd = await ag.c.rpc("update_my_lead", {
      p_lead_id: mineLead.id, p_first_name: "Mine", p_last_name: "One", p_company_name: "Co", p_email: "m@one.test",
      p_phone_e164: mineLead.phone_e164!, p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "note A",
      p_extra: { next_step: "Email quote", appointment_at: "2026-04-01T10:00:00Z", website: "https://one.test", contact_name: "Pat" },
    });
    check(!upd.error && upd.data?.next_step === "Email quote" && upd.data?.website === "https://one.test" && upd.data?.contact_name === "Pat" && !!upd.data?.appointment_at?.startsWith("2026-04-01T10:00"), "agent edits next step, appointment, website, contact on their own lead", upd.error?.message);
    const upd2 = await ag.c.rpc("update_my_lead", {
      p_lead_id: mineLead.id, p_first_name: "Mine", p_last_name: "One", p_company_name: "Co", p_email: "m@one.test",
      p_phone_e164: mineLead.phone_e164!, p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "note B",
    });
    check(!upd2.error && upd2.data?.next_step === "Email quote" && upd2.data?.agent_notes === "note B", "omitting p_extra leaves the new fields alone");
    const upd3 = await ag.c.rpc("update_my_lead", {
      p_lead_id: mineLead.id, p_first_name: "Mine", p_last_name: "One", p_company_name: "Co", p_email: "m@one.test",
      p_phone_e164: suppressedPhone, p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "x",
    });
    check(!!upd3.error && /suppression/i.test(upd3.error.message), "suppressed replacement number is still refused", upd3.error?.message);
    const updOther = await lg.c.rpc("update_my_lead", {
      p_lead_id: mineLead.id, p_first_name: "x", p_last_name: "x", p_company_name: "x", p_email: "", p_phone_e164: mineLead.phone_e164!,
      p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "hijack", p_extra: { next_step: "hijack" },
    });
    check(!!updOther.error, "someone else cannot edit a lead that is not theirs", updOther.error?.message);

    console.log("\n13. Cross-workspace isolation");
    const other = await signIn("admin@leadcallient.demo", DEMO_PASSWORD);
    const ctxOther = { supabase: other.c, workspaceId: other.profile.workspace_id, userId: other.profile.id, role: other.profile.role as string };
    const otherCamps = await loadCampaigns(ctxOther);
    check(!otherCamps.some((c) => created.campaigns.includes(c.id)), "another workspace's admin cannot list these campaigns");
    let crossErr = "";
    try {
      await buildPlan(ctxOther, { parsed: parseTabular(fileM, "m.csv"), mapping: mapM, campaigns: otherCamps, defaultCampaignId: campA });
    } catch (e) {
      crossErr = e instanceof Error ? e.message : String(e);
    }
    check(/Campaign not found/.test(crossErr), "importing into another workspace's campaign id is refused", crossErr);
    const seeOurs = await other.c.from("leads").select("id").in("id", created.leads);
    check((seeOurs.data ?? []).length === 0, "another workspace cannot read these leads");
    const ourPlanVsOther = await buildPlan(ctxOwn, { parsed: parseTabular(csv([["P"], [gbE164(1)]]), "p.csv"), mapping: { name: { none: true }, phone: { column: "P" }, company: { none: true }, email: { none: true } }, campaigns, defaultCampaignId: campA });
    check(ourPlanVsOther.preview.alreadyInWorkspace === 1, "duplicate check sees this workspace's leads");
    const guardLg = await svc.from("campaign_assignments").insert({ workspace_id: wsId, campaign_id: campB, user_id: lg.id });
    check(!!guardLg.error, "roster guard still refuses a lead_gen user (only agents, team leads, managers)", guardLg.error?.message);
  } finally {
    console.log("\n[cleanup]");
    try {
      if (created.leads.length) await svc.from("leads").delete().in("id", created.leads);
      if (created.batches.length) {
        await svc.from("leads").delete().in("batch_id", created.batches);
        await svc.from("lead_batches").delete().in("id", created.batches);
      }
      if (created.campaigns.length) {
        await svc.from("campaign_assignments").delete().in("campaign_id", created.campaigns);
        await svc.from("leads").delete().in("campaign_id", created.campaigns);
        await svc.from("lead_batches").delete().in("campaign_id", created.campaigns);
        await svc.from("campaigns").delete().in("id", created.campaigns);
      }
      if (created.clients.length) await svc.from("clients").delete().in("id", created.clients);
      if (created.supp.length) await svc.from("suppression_list").delete().in("id", created.supp);
      if (created.paths.length) await svc.storage.from("lead-uploads").remove(created.paths);
      if (created.users.length) await svc.from("profiles").delete().in("id", created.users);
      for (const u of created.users) await svc.auth.admin.deleteUser(u);
      await svc.from("workspaces").update({ status: originalStatus }).eq("id", wsId);
      const { count: leftLeads } = await svc.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", wsId);
      const { data: wsNow } = await svc.from("workspaces").select("status").eq("id", wsId).single();
      console.log(`  ZZ workspace status restored to '${wsNow?.status}'; leads left in ZZ workspace: ${leftLeads}`);
    } catch (e) {
      console.error("  cleanup problem:", e);
    }
  }

  console.log(failures === 0 ? "\nAll import checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
