// `npm run test:guide` (tsx scripts/guide-proof.ts).
//
// Proves the guided-setup database pieces over real signed-in sessions:
//   * setup_progress(): correct counts for the demo workspace, refused to every
//     non-manager role, scoped to the caller's own workspace
//   * user_guide_state RLS: own row only, cross-user and cross-workspace denied
//   * workspace activation: no workspace is left in 'onboarding', a customer
//     cannot change their own status, the service role can (the guard fix in
//     migration 96)
//
// Needs the seeded demo workspace and the throwaway test workspace
// "ZZ Onboarding Test Co" (one super_admin whose email starts "zz-onboarding-",
// password Testing#12345). The test workspace is left 'canceled'.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD, DEMO_PERSONAS, type AppRole } from "@/lib/seed/personas";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZZ_PASSWORD = "Testing#12345";

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok    ${label}`);
  else {
    console.error(`  FAIL  ${label}${detail !== undefined ? ` - ${JSON.stringify(detail)}` : ""}`);
    failures++;
  }
}

async function signInAs(email: string, password: string): Promise<SupabaseClient<RealDatabase>> {
  const client = createClient<RealDatabase>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return client;
}

async function main() {
  if (!url || !anonKey || !serviceKey) {
    console.error("guide-proof: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }
  const admin = createClient<RealDatabase>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: demo } = await admin.from("workspaces").select("id").eq("slug", "demo").single();
  if (!demo) throw new Error("demo workspace not found - run npm run seed");
  const { data: zzProfile } = await admin
    .from("profiles")
    .select("id, email, workspace_id")
    .like("email", "zz-onboarding-%")
    .limit(1)
    .single();
  if (!zzProfile) throw new Error("ZZ Onboarding Test Co owner not found");

  const byRole = {} as Record<AppRole, SupabaseClient<RealDatabase>>;
  for (const p of DEMO_PERSONAS) byRole[p.role] = await signInAs(p.email, DEMO_PASSWORD);
  const zz = await signInAs(zzProfile.email, ZZ_PASSWORD);

  // ---------------------------------------------------------------- 1
  console.log("\n1. setup_progress(): counts for the demo workspace");
  const cap = (n: number | null) => Math.min(n ?? 0, 1000);
  // The filter callback takes a query builder whose exact generic type differs per
  // table, so it is loosely typed in this test helper.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const count = async (table: "profiles" | "campaigns" | "leads" | "campaign_assignments" | "calls", extra?: (q: any) => any) => {
    let q: any = admin.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", demo.id);
    if (extra) q = extra(q);
    const { count: c } = await q;
    return cap(c);
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const expected = {
    agents: await count("profiles", (q) => q.eq("role", "agent").eq("is_active", true)),
    campaigns: await count("campaigns"),
    // Only real leads count (migration 109): rows with a data source or a source
    // label. Seeded demo leads carry neither, so they never tick the checklist.
    leads: await count("leads", (q) => q.or("data_source_id.not.is.null,source.not.is.null")),
    leads_passed: await count("leads", (q) => q.or("data_source_id.not.is.null,source.not.is.null").eq("screening_status", "passed")),
    assignments: await count("campaign_assignments"),
    calls: await count("calls"),
  };
  const { data: demoWs } = await admin
    .from("workspaces")
    .select("brand_logo_url, brand_primary_color, brand_product_name")
    .eq("id", demo.id)
    .single();
  const { data: demoZoom } = await admin.from("zoom_credentials").select("status").eq("workspace_id", demo.id).maybeSingle();
  const expectedBranded = Boolean(demoWs?.brand_logo_url || demoWs?.brand_primary_color || demoWs?.brand_product_name);
  const expectedZoom = demoZoom?.status === "connected";

  for (const role of ["super_admin", "ops_manager"] as const) {
    const { data, error } = await byRole[role].rpc("setup_progress");
    const row = Array.isArray(data) ? data[0] : data;
    check(`${role} can call setup_progress()`, !error && !!row, error?.message);
    if (row) {
      check(`${role}: agents = ${expected.agents}`, row.agents === expected.agents, row.agents);
      check(`${role}: campaigns = ${expected.campaigns}`, row.campaigns === expected.campaigns, row.campaigns);
      check(`${role}: leads = ${expected.leads}`, row.leads === expected.leads, row.leads);
      check(`${role}: leads_passed = ${expected.leads_passed}`, row.leads_passed === expected.leads_passed, row.leads_passed);
      check(`${role}: assignments = ${expected.assignments}`, row.assignments === expected.assignments, row.assignments);
      check(`${role}: calls = ${expected.calls}`, row.calls === expected.calls, row.calls);
      check(`${role}: branded = ${expectedBranded}`, row.branded === expectedBranded, row.branded);
      check(`${role}: zoom_connected = ${expectedZoom}`, row.zoom_connected === expectedZoom, row.zoom_connected);
    }
  }

  // ---------------------------------------------------------------- 2
  console.log("\n2. setup_progress(): refused to non-managers");
  for (const role of ["team_lead", "agent", "lead_gen", "qa_analyst", "client"] as const) {
    const { data, error } = await byRole[role].rpc("setup_progress");
    check(`${role} is refused`, !!error && !data, { error: error?.message, data });
  }
  {
    const anon = createClient<RealDatabase>(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("setup_progress");
    check("signed-out caller is refused", !!error && !data, error?.message);
  }

  // ---------------------------------------------------------------- 3
  console.log("\n3. setup_progress(): scoped to the caller's own workspace");
  {
    const { data, error } = await zz.rpc("setup_progress");
    const row = Array.isArray(data) ? data[0] : data;
    check("ZZ owner can call setup_progress()", !error && !!row, error?.message);
    // Compare with the test workspace's own rows, never the demo's.
    const zzCampaigns = (await admin.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", zzProfile.workspace_id)).count ?? 0;
    const zzLeads = (await admin.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", zzProfile.workspace_id).or("data_source_id.not.is.null,source.not.is.null")).count ?? 0;
    const zzCalls = (await admin.from("calls").select("id", { count: "exact", head: true }).eq("workspace_id", zzProfile.workspace_id)).count ?? 0;
    if (row) {
      check(`ZZ campaigns = ${zzCampaigns} (not the demo's ${expected.campaigns})`, row.campaigns === Math.min(zzCampaigns, 1000), row.campaigns);
      check(`ZZ leads = ${zzLeads} (not the demo's ${expected.leads})`, row.leads === Math.min(zzLeads, 1000), row.leads);
      check(`ZZ calls = ${zzCalls}`, row.calls === Math.min(zzCalls, 1000), row.calls);
      check("ZZ and demo counts differ somewhere", row.leads !== expected.leads || row.campaigns !== expected.campaigns);
    }
  }

  // ---------------------------------------------------------------- 4
  console.log("\n4. user_guide_state RLS");
  const { data: adminProfile } = await admin.from("profiles").select("id").eq("email", "admin@leadcallient.demo").single();
  const { data: agentProfile } = await admin.from("profiles").select("id").eq("email", "agent@leadcallient.demo").single();
  if (!adminProfile || !agentProfile) throw new Error("demo personas missing");
  const { data: priorAdmin } = await admin.from("user_guide_state").select("*").eq("user_id", adminProfile.id).maybeSingle();
  const { data: priorAgent } = await admin.from("user_guide_state").select("*").eq("user_id", agentProfile.id).maybeSingle();
  const { data: priorZz } = await admin.from("user_guide_state").select("*").eq("user_id", zzProfile.id).maybeSingle();

  try {
    const t = new Date().toISOString();
    // Own row: insert, read, update.
    const own = await byRole.super_admin
      .from("user_guide_state")
      .upsert({ user_id: adminProfile.id, workspace_id: demo.id, tour_seen_at: t }, { onConflict: "user_id" });
    check("a user can write their own row", !own.error, own.error?.message);
    const read = await byRole.super_admin.from("user_guide_state").select("user_id").eq("user_id", adminProfile.id);
    check("a user can read their own row", (read.data ?? []).length === 1);
    const upd = await byRole.super_admin
      .from("user_guide_state")
      .update({ checklist_dismissed_at: t })
      .eq("user_id", adminProfile.id)
      .select("user_id");
    check("a user can update their own row", !upd.error && (upd.data ?? []).length === 1, upd.error?.message);

    // Another user in the SAME workspace cannot see or change it.
    const peer = await byRole.agent.from("user_guide_state").select("user_id").eq("user_id", adminProfile.id);
    check("same-workspace colleague cannot read it", (peer.data ?? []).length === 0);
    const peerList = await byRole.ops_manager.from("user_guide_state").select("user_id");
    check("a manager sees only their own row in a full select", (peerList.data ?? []).every((r) => r.user_id !== adminProfile.id));
    const peerWrite = await byRole.agent
      .from("user_guide_state")
      .update({ tour_seen_at: null })
      .eq("user_id", adminProfile.id)
      .select("user_id");
    check("same-workspace colleague cannot update it", (peerWrite.data ?? []).length === 0);
    const peerInsert = await byRole.agent
      .from("user_guide_state")
      .insert({ user_id: adminProfile.id, workspace_id: demo.id });
    check("cannot insert a row for someone else", !!peerInsert.error, peerInsert.error?.message);

    // Another WORKSPACE cannot see or touch it either.
    const cross = await zz.from("user_guide_state").select("user_id").eq("user_id", adminProfile.id);
    check("other workspace cannot read it", (cross.data ?? []).length === 0);
    const crossWrite = await zz
      .from("user_guide_state")
      .update({ tour_seen_at: null })
      .eq("user_id", adminProfile.id)
      .select("user_id");
    check("other workspace cannot update it", (crossWrite.data ?? []).length === 0);
    const crossInsert = await zz.from("user_guide_state").insert({ user_id: adminProfile.id, workspace_id: demo.id });
    check("other workspace cannot insert for that user", !!crossInsert.error, crossInsert.error?.message);
    const wrongWs = await zz.from("user_guide_state").insert({ user_id: zzProfile.id, workspace_id: demo.id });
    check("cannot file your own row under another workspace", !!wrongWs.error, wrongWs.error?.message);

    const { data: after } = await admin.from("user_guide_state").select("tour_seen_at, checklist_dismissed_at").eq("user_id", adminProfile.id).single();
    check("the owner's row survived all of that untouched", !!after?.tour_seen_at && !!after?.checklist_dismissed_at);

    // Own row works for another workspace's user too (positive control).
    const zzOwn = await zz.from("user_guide_state").upsert({ user_id: zzProfile.id, workspace_id: zzProfile.workspace_id, tour_seen_at: t }, { onConflict: "user_id" });
    check("ZZ owner can write their own row", !zzOwn.error, zzOwn.error?.message);
  } finally {
    // Restore exactly what was there before.
    for (const [id, prior] of [
      [adminProfile.id, priorAdmin],
      [agentProfile.id, priorAgent],
      [zzProfile.id, priorZz],
    ] as const) {
      if (prior) await admin.from("user_guide_state").upsert(prior, { onConflict: "user_id" });
      else await admin.from("user_guide_state").delete().eq("user_id", id);
    }
  }

  // ---------------------------------------------------------------- 5
  console.log("\n5. Workspace activation");
  {
    const { count: stuck } = await admin.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "onboarding");
    check("no workspace is left in 'onboarding'", (stuck ?? 0) === 0, stuck);

    const { data: before } = await admin.from("workspaces").select("status").eq("id", zzProfile.workspace_id).single();
    const original = before?.status ?? "canceled";
    // A customer cannot change their own status (guard trigger)...
    const target = original === "suspended" ? "active" : "suspended";
    const own = await zz.from("workspaces").update({ status: target }).eq("id", zzProfile.workspace_id);
    const { data: still } = await admin.from("workspaces").select("status").eq("id", zzProfile.workspace_id).single();
    check("a customer session cannot change workspace status", !!own.error && still?.status === original, { error: own.error?.message, now: still?.status });
    // ...the service role can (this is what activates a workspace).
    const flip = await admin.from("workspaces").update({ status: original === "active" ? "canceled" : "active" }).eq("id", zzProfile.workspace_id);
    check("the service role can change workspace status", !flip.error, flip.error?.message);
    const back = await admin.from("workspaces").update({ status: original }).eq("id", zzProfile.workspace_id);
    check("...and put it back", !back.error, back.error?.message);
  }

  console.log(failures === 0 ? "\nAll guide checks passed." : `\n${failures} guide check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
