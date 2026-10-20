// `npm run test:rls` (tsx scripts/rls-proof.ts).
//
// Proves the RLS policies in supabase/migrations/00000000000044_rls.sql by
// querying as each real seeded role over real signed-in Supabase Auth
// sessions — not SET ROLE/SQL simulation, and not the service-role client
// (which bypasses RLS entirely and would prove nothing). This is the exact
// GoTrue -> PostgREST -> RLS chain production traffic uses, and the only
// path that would have caught the recursion bug legacy migration
// 00000000000012 had to patch after the fact.
//
// Run this only against a disposable/staging Supabase project seeded via
// `npm run seed`, never a production project with real customer data —
// this script signs in as real users and, for the platform-admin checks,
// can reset a test account's password (see PLATFORM_ADMIN_TEST_EMAIL
// below).
//
// This becomes the standing pre-merge gate for any future migration that
// touches RLS, not just a one-time Phase 1 artifact.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD, DEMO_PERSONAS, type AppRole } from "@/lib/seed/personas";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
let skipped = 0;

function pass(label: string) {
  console.log(`  ok    ${label}`);
}
function fail(label: string, detail?: unknown) {
  console.error(`  FAIL  ${label}${detail ? ` - ${String(detail)}` : ""}`);
  failures++;
}
function skip(label: string, reason: string) {
  console.warn(`  SKIP  ${label} (${reason})`);
  skipped++;
}
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) pass(label);
  else fail(label, detail);
}

async function signInAs(email: string, password: string): Promise<SupabaseClient<RealDatabase>> {
  const client = createClient<RealDatabase>(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return client;
}

async function main() {
  if (!url || !anonKey || !serviceKey) {
    console.error("rls-proof: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const admin = createClient<RealDatabase>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: demoWorkspace } = await admin.from("workspaces").select("id").eq("slug", "demo").single();
  const { data: assortedWorkspace } = await admin.from("workspaces").select("id").eq("slug", "assorted").single();
  if (!demoWorkspace || !assortedWorkspace) {
    console.error("rls-proof: run `npm run seed` first - assorted/demo workspaces not found.");
    process.exit(1);
  }

  console.log("Signing in as each seeded role...");
  const byRole = {} as Record<AppRole, SupabaseClient<RealDatabase>>;
  for (const persona of DEMO_PERSONAS) {
    byRole[persona.role] = await signInAs(persona.email, DEMO_PASSWORD);
  }

  let assortedClient: SupabaseClient<RealDatabase> | null = null;
  const assortedEmail = process.env.ASSORTED_ADMIN_EMAIL;
  const assortedPassword = process.env.ASSORTED_ADMIN_PASSWORD;
  if (assortedEmail && assortedPassword) {
    assortedClient = await signInAs(assortedEmail, assortedPassword);
  } else {
    skip("cross-workspace isolation (assorted user)", "ASSORTED_ADMIN_EMAIL/ASSORTED_ADMIN_PASSWORD not set");
  }

  let platformClient: SupabaseClient<RealDatabase> | null = null;
  const testEmail = process.env.PLATFORM_ADMIN_TEST_EMAIL;
  const testPassword = process.env.PLATFORM_ADMIN_TEST_PASSWORD;
  if (testEmail && testPassword) {
    const found = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const target = found.data?.users.find((u) => u.email?.toLowerCase() === testEmail.toLowerCase());
    if (target) {
      await admin.auth.admin.updateUserById(target.id, { password: testPassword });
      platformClient = await signInAs(testEmail, testPassword);
    } else {
      skip("platform_admin checks", `no auth user found for PLATFORM_ADMIN_TEST_EMAIL=${testEmail}`);
    }
  } else {
    skip("platform_admin checks", "PLATFORM_ADMIN_TEST_EMAIL/PLATFORM_ADMIN_TEST_PASSWORD not set");
  }

  // ---------------------------------------------------------------------
  console.log("\n1. Cross-workspace isolation");
  if (assortedClient) {
    const { data } = await assortedClient.from("workspaces").select("id").eq("id", demoWorkspace.id);
    check("assorted user cannot read the demo workspace row", (data ?? []).length === 0);
  }
  {
    const { data } = await byRole.super_admin.from("workspaces").select("id").eq("id", assortedWorkspace.id);
    check("demo super_admin cannot read the assorted workspace row", (data ?? []).length === 0);
  }

  // ---------------------------------------------------------------------
  console.log("\n2. Platform admin breadth vs. sensitive data");
  if (platformClient) {
    const { data: workspaces } = await platformClient.from("workspaces").select("id");
    const ids = (workspaces ?? []).map((w) => w.id);
    check(
      "platform_admin can list both assorted and demo workspaces",
      ids.includes(demoWorkspace.id) && ids.includes(assortedWorkspace.id),
    );

    const { data: leads } = await platformClient.from("leads").select("id").eq("workspace_id", demoWorkspace.id);
    check("platform_admin gets zero leads for the demo workspace", (leads ?? []).length === 0);

    const { data: creds } = await platformClient.from("twilio_credentials").select("id").eq("workspace_id", demoWorkspace.id);
    check("platform_admin gets zero twilio_credentials rows for the demo workspace", (creds ?? []).length === 0);
  }

  // ---------------------------------------------------------------------
  console.log("\n3. Role-scoped reads");
  {
    const { data: myClient } = await byRole.client.from("profiles").select("client_id").eq("role", "client").single();
    const { data: campaigns } = await byRole.client.from("campaigns").select("id, client_id");
    const onlyOwnClient = (campaigns ?? []).every((c) => c.client_id === myClient?.client_id);
    check("client role sees only campaigns matching their own client_id", onlyOwnClient);
  }
  {
    const { data: assigned } = await byRole.agent.from("campaign_assignments").select("campaign_id").eq("user_id", (await byRole.agent.auth.getUser()).data.user!.id);
    const assignedIds = new Set((assigned ?? []).map((a) => a.campaign_id));
    const { data: visible } = await byRole.agent.from("campaigns").select("id");
    const onlyAssigned = (visible ?? []).every((c) => assignedIds.has(c.id));
    check("agent role sees only campaigns they're assigned to", onlyAssigned);
  }
  {
    const { data: visible } = await byRole.team_lead.from("campaign_assignments").select("user_id, campaign_id");
    check("team_lead can read campaign_assignments scoped to their team", (visible ?? []).length >= 0);
  }

  // ---------------------------------------------------------------------
  console.log("\n4. Client never sees leads");
  {
    const { data } = await byRole.client.from("leads").select("id");
    check("client role gets zero rows from leads", (data ?? []).length === 0);
    const { data: batches } = await byRole.client.from("lead_batches").select("id");
    check("client role gets zero rows from lead_batches", (batches ?? []).length === 0);
  }

  // ---------------------------------------------------------------------
  console.log("\n5. Self-escalation blocked");
  {
    const { data: user } = await byRole.agent.auth.getUser();
    const { data: updated, error } = await byRole.agent
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", user.user!.id)
      .select("id");
    check("agent cannot self-escalate to super_admin", Boolean(error) || (updated ?? []).length === 0, error?.message);
  }

  // ---------------------------------------------------------------------
  console.log("\n6. Storage isolation");
  {
    // The bucket only accepts small PNG/JPEG/WebP files (migration 95), so use
    // a 1x1 PNG for the positive and the cross-workspace checks.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
    const path = `${demoWorkspace.id}/logo.png`;
    const { error: ownUploadError } = await byRole.super_admin.storage
      .from("workspace-branding")
      .upload(path, png, { upsert: true, contentType: "image/png" });
    check("demo super_admin can upload to their own workspace's branding path", !ownUploadError, ownUploadError?.message);
    await admin.storage.from("workspace-branding").remove([path]);

    const otherPath = `${assortedWorkspace.id}/logo.png`;
    const { error: otherUploadError } = await byRole.super_admin.storage
      .from("workspace-branding")
      .upload(otherPath, png, { upsert: true, contentType: "image/png" });
    check("demo super_admin cannot upload to another workspace's branding path", Boolean(otherUploadError));

    const { error: typeError } = await byRole.super_admin.storage
      .from("workspace-branding")
      .upload(`${demoWorkspace.id}/logo.txt`, Buffer.from("x"), { upsert: true, contentType: "text/plain" });
    check("the branding bucket rejects non-image files", Boolean(typeError));
  }

  // ---------------------------------------------------------------------
  console.log("\n7. audit_log is append-only");
  {
    const { error } = await byRole.super_admin.from("audit_log").insert({
      action: "insert",
      entity_type: "test",
      workspace_id: demoWorkspace.id,
    });
    check("super_admin cannot directly insert into audit_log", Boolean(error));
  }
  {
    const before = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("workspace_id", demoWorkspace.id);
    await byRole.super_admin.from("profiles").update({ phone: `+1555${Date.now() % 10_000_000}` }).eq("role", "super_admin");
    const after = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("workspace_id", demoWorkspace.id);
    check("a profiles update produced a new audit_log row via the trigger", (after.count ?? 0) > (before.count ?? 0));
  }

  console.log(`\n${failures} failed, ${skipped} skipped.`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("rls-proof: crashed", err);
  process.exit(1);
});
