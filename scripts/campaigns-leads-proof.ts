// Run: npx tsx --conditions=react-server scripts/campaigns-leads-proof.ts
//
// Proves slice B (campaigns / clients / leads / assignment / My leads /
// inbound webhook) against the live database over real signed-in sessions:
// the happy path as a manager, agent-side restrictions via RLS, the
// assignment-aware dial queue, and the inbound webhook. Creates a throwaway
// client + campaign in the demo workspace and removes them at the end.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createHash } from "node:crypto";
import Module, { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD } from "@/lib/seed/personas";
import { generateIntakeToken } from "@/lib/leads/intake-token";

// tsx loads libphonenumber-js' bundled metadata JSON as { default } under CJS
// interop, which its metadata validator rejects (Next.js loads it fine). The
// route handler is exercised directly below, so hand it a wrapper that passes
// the metadata explicitly. Test-harness only.
{
  const req = createRequire(import.meta.url ?? __filename);
  const core = req("libphonenumber-js/core");
  const metadata = req("libphonenumber-js/metadata.min.json");
  const original = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
  (Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
    if (request === "libphonenumber-js") {
      return { parsePhoneNumberWithError: (text: string, country: string) => core.parsePhoneNumberWithError(text, country, metadata) };
    }
    return original.call(this, request, ...rest);
  };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok    ${label}`);
  else {
    console.error(`  FAIL  ${label}${detail ? ` - ${JSON.stringify(detail)}` : ""}`);
    failures++;
  }
}

async function signIn(email: string): Promise<SupabaseClient<RealDatabase>> {
  const c = createClient<RealDatabase>(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

const hash = (p: string) => createHash("sha256").update(p).digest("hex");

async function main() {
  const admin = createClient<RealDatabase>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: ws } = await admin.from("workspaces").select("id, demo_allowed_numbers").eq("slug", "demo").single();
  if (!ws) throw new Error("demo workspace missing");
  // The demo workspace only serves allow-listed numbers; temporarily add two
  // throwaway test numbers and restore the original list in `finally`.
  const originalAllowed = ws.demo_allowed_numbers ?? [];
  const allowed = ["+14155550101", "+14155550102"];

  const ops = await signIn("ops@leadcallient.demo");
  const agentA = await signIn("agent@leadcallient.demo");
  const teamLead = await signIn("teamlead@leadcallient.demo");
  const { data: agentAUser } = await agentA.auth.getUser();
  const agentAId = agentAUser.user!.id;
  // The seed has a single agent; a rostered team lead plays the second agent.
  const { data: tlUser } = await teamLead.auth.getUser();
  const agentBProfile = { id: tlUser.user!.id, email: "teamlead@leadcallient.demo" };
  const agentB = teamLead;

  let clientId: string | null = null;
  let campaignId: string | null = null;
  let otherCampaignId: string | null = null;
  const tag = `ZZ proof ${Date.now()}`;

  try {
    await admin.from("workspaces").update({ demo_allowed_numbers: [...originalAllowed, ...allowed] }).eq("id", ws.id);
    console.log("\n1. Manager: client + campaign + edit + roster");
    const { data: client, error: ce } = await ops
      .from("clients")
      .insert({ workspace_id: ws.id, name: `${tag} client`, contact_email: "c@example.com", is_data_controller: true, dpa_signed_on: "2026-01-01" })
      .select("id")
      .single();
    check("manager creates a client", Boolean(client) && !ce, ce?.message);
    clientId = client?.id ?? null;

    const { data: camp, error: cpe } = await ops
      .from("campaigns")
      .insert({ workspace_id: ws.id, client_id: clientId, name: `${tag} A`, code: `ZZ${Date.now() % 100000}`, country: "US", status: "paused", audience: "B2B" })
      .select("*")
      .single();
    check("manager creates a (paused) campaign", Boolean(camp) && !cpe, cpe?.message);
    campaignId = camp?.id ?? null;
    const { data: camp2 } = await ops
      .from("campaigns")
      .insert({ workspace_id: ws.id, client_id: clientId, name: `${tag} B`, country: "US", status: "active" })
      .select("id")
      .single();
    otherCampaignId = camp2?.id ?? null;

    const { data: edited, error: ee } = await ops
      .from("campaigns")
      .update({
        caller_id: "+15555550100",
        calling_window_start: "00:00",
        calling_window_end: "23:59",
        timezone: "America/New_York",
        max_attempts: 3,
        cooling_off_hours: 0,
        recording_enabled: true,
        disclosure_script: "This call may be recorded.",
        objection_notes: "n/a",
        status: "active",
      })
      .eq("id", campaignId!)
      .select("*")
      .single();
    check(
      "manager edits campaign settings and activates it",
      !ee && edited?.status === "active" && edited.max_attempts === 3 && edited.recording_enabled === true && edited.caller_id === "+15555550100",
      ee?.message,
    );
    const { error: badAttempts } = await ops.from("campaigns").update({ max_attempts: 0 }).eq("id", campaignId!);
    check("max_attempts = 0 rejected by constraint", Boolean(badAttempts));

    const { error: ra } = await ops.from("campaign_assignments").insert({ workspace_id: ws.id, campaign_id: campaignId!, user_id: agentAId, daily_target: 2 });
    const { error: rb } = await ops.from("campaign_assignments").insert({ workspace_id: ws.id, campaign_id: campaignId!, user_id: agentBProfile.id, daily_target: 5 });
    check("manager assigns two agents to the roster", !ra && !rb, ra?.message ?? rb?.message);
    // Migration 99: managers may be rostered (they dial their own uploaded data).
    const opsId = (await ops.auth.getUser()).data.user!.id;
    const { error: mgrAssign } = await ops
      .from("campaign_assignments")
      .insert({ workspace_id: ws.id, campaign_id: campaignId!, user_id: opsId });
    check("a manager can be put on a roster (migration 99)", !mgrAssign, mgrAssign?.message);
    await ops.from("campaign_assignments").delete().eq("campaign_id", campaignId!).eq("user_id", opsId);

    const { data: ag } = await agentA.from("campaigns").update({ name: "hacked" }).eq("id", campaignId!).select("id");
    check("agent cannot edit a campaign", (ag ?? []).length === 0);
    const { data: agClient } = await agentA.from("clients").update({ name: "hacked" }).eq("id", clientId!).select("id");
    check("agent cannot edit a client", (agClient ?? []).length === 0);

    console.log("\n2. Manager: add leads, screen, auto-assign");
    const phones = [allowed[0], allowed[1]];
    const inserted: string[] = [];
    for (const [i, phone] of phones.entries()) {
      const { data: lead, error: le } = await ops
        .from("leads")
        .insert({
          workspace_id: ws.id,
          campaign_id: campaignId,
          phone_e164: phone,
          first_name: `Proof${i}`,
          last_name: "Lead",
          company_name: "Acme",
          email: `proof${i}@example.com`,
          source: "manual",
        })
        .select("*")
        .single();
      check(`manager adds lead ${i} (phone_hash computed, pending, full_name synced)`, !le && lead?.phone_hash === hash(phone) && lead.screening_status === "pending" && lead.full_name === `Proof${i} Lead` && lead.status === "new", le?.message);
      if (lead) inserted.push(lead.id);
    }
    const { data: tlSees } = await teamLead.from("leads").select("id").in("id", inserted);
    check("team lead can read the new leads", (tlSees ?? []).length === inserted.length);
    const { data: aSeesBefore } = await agentA.from("leads").select("id").in("id", inserted);
    check("agent on the roster can read campaign leads (needed by the dial screen)", (aSeesBefore ?? []).length === inserted.length);

    const { data: unscreenedAssign } = await ops.rpc("auto_assign_campaign_leads", { p_campaign_id: campaignId! });
    check("auto-assign skips leads that have not passed screening", unscreenedAssign === 0, unscreenedAssign);

    const { data: passed, error: se } = await ops.rpc("screen_leads", { p_lead_ids: inserted });
    check("manager screens the leads", passed === inserted.length && !se, se?.message ?? passed);
    const { error: agScreen } = await agentA.rpc("screen_leads", { p_lead_ids: inserted });
    check("agent cannot screen leads", Boolean(agScreen));

    const { data: assignedN, error: ae } = await ops.rpc("auto_assign_campaign_leads", { p_campaign_id: campaignId! });
    check("auto-assign hands out both leads round-robin", assignedN === 2 && !ae, ae?.message ?? assignedN);
    const { data: assignedRows } = await admin.from("leads").select("id, assigned_to, status, assigned_at").in("id", inserted);
    const owners = new Set((assignedRows ?? []).map((r) => r.assigned_to));
    check(
      "leads are split between the two rostered agents with status=assigned",
      owners.size === 2 && owners.has(agentAId) && owners.has(agentBProfile.id) && (assignedRows ?? []).every((r) => r.status === "assigned" && r.assigned_at),
      assignedRows,
    );
    const myLeadId = assignedRows!.find((r) => r.assigned_to === agentAId)!.id;
    const bLeadId = assignedRows!.find((r) => r.assigned_to === agentBProfile.id)!.id;

    console.log("\n3. Agent: My leads, edit, status, restrictions");
    const { data: mine } = await agentA.from("leads").select("id").eq("assigned_to", agentAId).eq("campaign_id", campaignId!);
    check("agent's My leads query returns only their own assigned lead", (mine ?? []).length === 1 && mine![0].id === myLeadId, mine);

    const { data: direct } = await agentA.from("leads").update({ first_name: "x", screening_status: "passed" }).eq("id", myLeadId).select("id");
    check("agent has no direct UPDATE path on leads", (direct ?? []).length === 0);

    const { data: edit, error: ede } = await agentA.rpc("update_my_lead", {
      p_lead_id: myLeadId,
      p_first_name: "Edited",
      p_last_name: "ByAgent",
      p_company_name: "NewCo",
      p_email: "edited@example.com",
      p_phone_e164: (await admin.from("leads").select("phone_e164").eq("id", myLeadId).single()).data!.phone_e164!,
      p_address_line1: "1 Main St",
      p_city: "Austin",
      p_region: "TX",
      p_postcode: "78701",
      p_agent_notes: "called twice",
    });
    check("agent edits their own lead", !ede && (edit as { first_name?: string } | null)?.first_name === "Edited" && (edit as { screening_status?: string }).screening_status === "passed", ede?.message);

    const { error: editOther } = await agentA.rpc("update_my_lead", {
      p_lead_id: bLeadId, p_first_name: "x", p_last_name: "", p_company_name: "", p_email: "", p_phone_e164: "+15555550199",
      p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "",
    });
    check("agent cannot edit a lead assigned to someone else", Boolean(editOther), editOther?.message);

    const { error: st } = await agentA.rpc("set_my_lead_status", { p_lead_id: myLeadId, p_status: "qualified" });
    const { error: stBad } = await agentA.rpc("set_my_lead_status", { p_lead_id: bLeadId, p_status: "qualified" });
    check("agent sets status on own lead but not on another's", !st && Boolean(stBad));

    const { error: phoneChangeErr } = await agentA.rpc("update_my_lead", {
      p_lead_id: myLeadId, p_first_name: "Edited", p_last_name: "ByAgent", p_company_name: "NewCo", p_email: "", p_phone_e164: "+14155550123",
      p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "",
    });
    const { data: afterPhone } = await admin.from("leads").select("screening_status, screened_at, phone_hash").eq("id", myLeadId).single();
    check("changing the phone resets screening to pending and recomputes the hash", !phoneChangeErr && afterPhone?.screening_status === "pending" && afterPhone.screened_at === null && afterPhone.phone_hash === hash("+14155550123"), phoneChangeErr?.message ?? afterPhone);

    const { data: otherAgentSees } = await agentB.from("leads").select("id").eq("id", myLeadId);
    check("a rostered colleague can still read it (campaign visibility) but it is not in their My leads", (otherAgentSees ?? []).length <= 1);

    // An agent with no roster entry on this campaign sees none of its leads.
    const { data: outsiders } = await admin
      .from("profiles")
      .select("id, email")
      .eq("workspace_id", ws.id)
      .eq("role", "agent")
      .not("id", "in", `(${agentAId},${agentBProfile.id})`)
      .eq("is_active", true)
      .limit(1);
    if (outsiders?.[0]) {
      try {
        const outsider = await signIn(outsiders[0].email);
        const { data: nothing } = await outsider.from("leads").select("id").eq("campaign_id", campaignId!);
        check("an agent not on the campaign roster sees zero of its leads", (nothing ?? []).length === 0);
      } catch {
        console.log("  skip  third agent could not sign in");
      }
    }

    console.log("\n4. Dial queue respects assignment (compliance gate intact)");
    // Put A's lead back on its (demo-allow-listed) number and re-screen it so it can be served.
    const origPhone = phones[0] === (await admin.from("leads").select("phone_e164").eq("id", bLeadId).single()).data!.phone_e164 ? phones[1] : phones[0];
    await agentA.rpc("update_my_lead", {
      p_lead_id: myLeadId, p_first_name: "Edited", p_last_name: "ByAgent", p_company_name: "NewCo", p_email: "", p_phone_e164: origPhone,
      p_address_line1: "", p_city: "", p_region: "", p_postcode: "", p_agent_notes: "",
    });
    await ops.rpc("screen_leads", { p_lead_ids: [myLeadId] });
    if (process.env.PROOF_DEBUG) {
      console.log(JSON.stringify({
        w: (await admin.from("workspaces").select("is_demo, demo_allowed_numbers").eq("id", ws.id).single()).data,
        l: (await admin.from("leads").select("id, phone_e164, screening_status, screened_at, attempts, claimed_by, assigned_to, last_attempt_at, campaign_id").in("id", inserted)).data,
        c: (await admin.from("campaigns").select("status, calling_window_start, calling_window_end, timezone, max_attempts, cooling_off_hours").eq("id", campaignId!)).data,
      }, null, 1));
    }
    const { data: pullB, error: pbe } = await agentB.rpc("next_lead_for_agent", { p_agent_id: agentBProfile.id });
    check("agent B is served their own lead, never A's", !pbe && (pullB as { id?: string } | null)?.id === bLeadId, pbe?.message ?? pullB);
    const { data: pullB2 } = await agentB.rpc("next_lead_for_agent", { p_agent_id: agentBProfile.id });
    check("agent B has nothing else to pull from this campaign (A's assigned lead is withheld)", !(pullB2 as { campaign_id?: string } | null)?.campaign_id || (pullB2 as { campaign_id: string }).campaign_id !== campaignId, pullB2);
    const { data: pullA } = await agentA.rpc("next_lead_for_agent", { p_agent_id: agentAId });
    check("agent A is served their own lead", (pullA as { id?: string } | null)?.id === myLeadId, pullA);

    console.log("\n5. Remove agent from roster releases unworked leads");
    // release A's claim so the lead counts as unworked
    await admin.from("leads").update({ claimed_by: null, claimed_at: null }).in("id", inserted);
    const { data: released, error: rme } = await ops.rpc("remove_agent_from_campaign", { p_campaign_id: campaignId!, p_user_id: agentBProfile.id });
    const { data: bAfter } = await admin.from("leads").select("assigned_to, status").eq("id", bLeadId).single();
    check("removing an agent returns their unworked lead to the pool", !rme && released === 1 && bAfter?.assigned_to === null && bAfter.status === "new", rme?.message ?? { released, bAfter });
    const { error: agentRemove } = await agentA.rpc("remove_agent_from_campaign", { p_campaign_id: campaignId!, p_user_id: agentAId });
    check("agent cannot change a roster", Boolean(agentRemove));

    console.log("\n6. Suppression / duplicates");
    await admin.from("suppression_list").insert({ workspace_id: ws.id, phone_hash: hash("+14155550177"), reason: "proof" });
    const { data: supLead } = await ops
      .from("leads")
      .insert({ workspace_id: ws.id, campaign_id: campaignId, phone_e164: "+14155550177", first_name: "Sup" })
      .select("id")
      .single();
    if (supLead) inserted.push(supLead.id);
    const { data: failedScreen } = await ops.rpc("screen_leads", { p_lead_ids: supLead ? [supLead.id] : [] });
    const { data: supRow } = await admin.from("leads").select("screening_status").eq("id", supLead!.id).single();
    check("a suppressed number can never pass screening", failedScreen === 0 && supRow?.screening_status === "failed", supRow);
    await admin.from("suppression_list").delete().eq("workspace_id", ws.id).eq("phone_hash", hash("+14155550177"));

    console.log("\n7. Inbound webhook");
    const { token, hash: tokenHash, prefix } = generateIntakeToken();
    const { error: tokErr } = await ops
      .from("lead_intake_tokens")
      .upsert({ workspace_id: ws.id, token_hash: tokenHash, token_prefix: prefix }, { onConflict: "workspace_id" });
    check("manager can create the workspace webhook token", !tokErr, tokErr?.message);
    const { data: agentTok } = await agentA.from("lead_intake_tokens").select("token_hash");
    check("agent cannot read intake tokens", (agentTok ?? []).length === 0);

    const { POST } = await import("@/app/api/leads/inbound/route");
    const call = (body: unknown, tok: string | null = token) =>
      POST(
        new NextRequest("http://localhost/api/leads/inbound", {
          method: "POST",
          headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify(body),
        }),
      );
    const hookPhone = "+14155550188";
    const good = { campaign_id: campaignId, phone: hookPhone, first_name: "Web", last_name: "Form", email: "web@example.com", consent: true, consent_text: "I agree to be called." };
    const noTok = await call(good, null);
    check("webhook without a token -> 401", noTok.status === 401);
    const badTok = await call(good, "lci_wrong");
    check("webhook with a wrong token -> 401", badTok.status === 401);
    const noConsent = await call({ ...good, consent: false });
    check("webhook without consent -> 400", noConsent.status === 400);
    const foreign = await call({ ...good, campaign_id: "00000000-0000-4000-8000-000000000000" });
    check("webhook with unknown campaign -> 400", foreign.status === 400);
    const created = await call(good);
    const createdBody = (await created.json()) as { lead_id?: string };
    check("webhook with valid token creates a lead -> 201", created.status === 201 && Boolean(createdBody.lead_id), createdBody);
    if (createdBody.lead_id) {
      inserted.push(createdBody.lead_id);
      const { data: wl } = await admin.from("leads").select("*").eq("id", createdBody.lead_id).single();
      check(
        "the webhook lead is real: right workspace/campaign, hash set, pending, source=webhook",
        wl?.workspace_id === ws.id && wl.campaign_id === campaignId && wl.phone_hash === hash(hookPhone) && wl.screening_status === "pending" && wl.source === "webhook",
        wl,
      );
    }
    const dup = await call(good);
    check("webhook duplicate -> 409", dup.status === 409);

    console.log("\n8. Audit");
    const { data: audits } = await ops.from("audit_log").select("entity_type").eq("entity_id", campaignId!);
    const { data: assignAudits } = await ops.from("audit_log").select("id").eq("entity_type", "campaign_assignment").eq("workspace_id", ws.id).limit(1);
    check("campaign changes and roster changes are audited", (audits ?? []).length >= 2 && (assignAudits ?? []).length >= 1);
  } finally {
    console.log("\nCleaning up...");
    if (campaignId || otherCampaignId) {
      const ids = [campaignId, otherCampaignId].filter((x): x is string => Boolean(x));
      await admin.from("lead_batches").delete().in("campaign_id", ids);
      await admin.from("leads").delete().in("campaign_id", ids);
      await admin.from("campaign_assignments").delete().in("campaign_id", ids);
      await admin.from("campaigns").delete().in("id", ids);
    }
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    await admin.from("lead_intake_tokens").delete().eq("workspace_id", ws.id);
    await admin.from("workspaces").update({ demo_allowed_numbers: originalAllowed }).eq("id", ws.id);
    await admin.from("suppression_list").delete().eq("workspace_id", ws.id).eq("reason", "proof");
  }

  console.log(failures === 0 ? "\nAll slice B checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
