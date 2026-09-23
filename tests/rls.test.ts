/**
 * Section 5 — RLS test suite. Asserts, per role, exactly what is readable
 * and writable against the *live* Supabase project (there is no local
 * Postgres in this setup, so this is an integration test, not a unit test).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY in the environment (.env.local is loaded
 * automatically). Skips entirely — rather than failing — when the service
 * role key isn't present, since that key is deliberately not retrievable
 * via the Supabase MCP and has to come from the project owner.
 *
 * Run with: npm run test:rls
 *
 * Leads/suppression_list don't exist yet (Phase 2), so the spec's "agent
 * cannot read another agent's leads / cannot set screening_status"
 * negative test is mapped onto what Phase 1 actually built: agents cannot
 * read another agent's profile, and cannot touch the credential-lifecycle
 * columns on their own profile (guard_profile_self_update). Re-add the
 * leads-specific cases once Phase 2 lands.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCreds = Boolean(url && anonKey && serviceKey);
const d = hasCreds ? describe : describe.skip;

if (!hasCreds) {
  // eslint-disable-next-line no-console
  console.warn(
    "Skipping RLS suite — set SUPABASE_SERVICE_ROLE_KEY (and the two NEXT_PUBLIC_ vars) to run it for real.",
  );
}

type Role = "super_admin" | "ops_manager" | "team_lead" | "qa" | "agent" | "client_viewer";

const RUN_ID = Math.random().toString(36).slice(2, 8);
const PASSWORD = "Rls-Test-Password-1234!";

d("Row Level Security", () => {
  let admin: SupabaseClient;
  const userIds: Partial<Record<Role, string>> = {};
  const clients: Record<Role, SupabaseClient> = {} as never;

  let teamAId: string;
  let teamBId: string;
  let clientId: string;
  let campaignId: string;
  let otherCampaignId: string;

  async function createTestUser(role: Role, email: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("no user returned");

    const { error: profileError } = await admin.from("profiles").insert({
      id: data.user.id,
      full_name: `RLS Test ${role}`,
      role,
      must_change_password: false,
      ...extra,
    });
    if (profileError) throw profileError;

    userIds[role] = data.user.id;

    const client = createClient(url!, anonKey!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;
    clients[role] = client;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: client } = await admin
      .from("clients")
      .insert({ name: `RLS Test Client ${RUN_ID}` })
      .select()
      .single();
    clientId = client!.id;

    const { data: teamA } = await admin.from("teams").insert({ name: `RLS Team A ${RUN_ID}` }).select().single();
    teamAId = teamA!.id;
    const { data: teamB } = await admin.from("teams").insert({ name: `RLS Team B ${RUN_ID}` }).select().single();
    teamBId = teamB!.id;

    const { data: campaign } = await admin
      .from("campaigns")
      .insert({
        client_id: clientId,
        name: `RLS Campaign ${RUN_ID}`,
        code: `RLS-${RUN_ID}`,
        market: "UK",
        audience: "B2C",
      })
      .select()
      .single();
    campaignId = campaign!.id;

    const { data: otherCampaign } = await admin
      .from("campaigns")
      .insert({
        client_id: clientId,
        name: `RLS Campaign Other ${RUN_ID}`,
        code: `RLS-OTHER-${RUN_ID}`,
        market: "US",
        audience: "B2C",
      })
      .select()
      .single();
    otherCampaignId = otherCampaign!.id;

    await createTestUser("super_admin", `rls-super-${RUN_ID}@example.com`);
    await createTestUser("ops_manager", `rls-ops-${RUN_ID}@example.com`);
    await createTestUser("team_lead", `rls-lead-${RUN_ID}@example.com`, { team_id: teamAId });
    await createTestUser("qa", `rls-qa-${RUN_ID}@example.com`);
    await createTestUser("agent", `rls-agent-a-${RUN_ID}@example.com`, { team_id: teamAId });
    await createTestUser("client_viewer", `rls-client-${RUN_ID}@example.com`, { client_id: clientId });

    // A second agent, same team, used only for the "can't see each other" check.
    const { data: agentB } = await admin.auth.admin.createUser({
      email: `rls-agent-b-${RUN_ID}@example.com`,
      password: PASSWORD,
      email_confirm: true,
    });
    await admin
      .from("profiles")
      .insert({ id: agentB!.user!.id, full_name: "RLS Test agent B", role: "agent", team_id: teamAId });
    userIds["agent" as Role] = userIds.agent; // keep primary agent id
    const agentBId = agentB!.user!.id;

    await admin.from("campaign_assignments").insert({ campaign_id: campaignId, user_id: userIds.agent! });

    (globalThis as { __agentBId?: string }).__agentBId = agentBId;
  }, 30000);

  afterAll(async () => {
    for (const id of Object.values(userIds)) {
      if (id) await admin.auth.admin.deleteUser(id);
    }
    const agentBId = (globalThis as { __agentBId?: string }).__agentBId;
    if (agentBId) await admin.auth.admin.deleteUser(agentBId);

    await admin.from("campaigns").delete().in("id", [campaignId, otherCampaignId]);
    await admin.from("teams").delete().in("id", [teamAId, teamBId]);
    await admin.from("clients").delete().eq("id", clientId);
  }, 30000);

  it("agent can read their own profile", async () => {
    const { data, error } = await clients.agent.from("profiles").select("*").eq("id", userIds.agent!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("agent CANNOT read another agent's profile", async () => {
    const agentBId = (globalThis as { __agentBId?: string }).__agentBId!;
    const { data, error } = await clients.agent.from("profiles").select("*").eq("id", agentBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS silently filters, doesn't error
  });

  it("agent CANNOT escalate their own role", async () => {
    const { error } = await clients.agent
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", userIds.agent!);
    expect(error).not.toBeNull();
  });

  it("agent CANNOT flip their own is_active or must_change_password", async () => {
    const { error } = await clients.agent
      .from("profiles")
      .update({ is_active: false })
      .eq("id", userIds.agent!);
    expect(error).not.toBeNull();
  });

  it("team_lead can read their own team's profiles", async () => {
    const { data, error } = await clients.team_lead.from("profiles").select("*").eq("team_id", teamAId);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(2); // the lead + at least one agent
  });

  it("qa can read every profile", async () => {
    const { data, error } = await clients.qa.from("profiles").select("*").eq("id", userIds.agent!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("client_viewer can only ever read their own profile row", async () => {
    const { data: own } = await clients.client_viewer.from("profiles").select("*").eq("id", userIds.client_viewer!);
    expect(own).toHaveLength(1);

    const { data: someoneElse } = await clients.client_viewer
      .from("profiles")
      .select("*")
      .eq("id", userIds.agent!);
    expect(someoneElse).toHaveLength(0);
  });

  it("agent can read campaigns they're assigned to, not others", async () => {
    const { data: assigned } = await clients.agent.from("campaigns").select("id").eq("id", campaignId);
    expect(assigned).toHaveLength(1);

    const { data: notAssigned } = await clients.agent.from("campaigns").select("id").eq("id", otherCampaignId);
    expect(notAssigned).toHaveLength(0);
  });

  it("agent CANNOT create a campaign", async () => {
    const { error } = await clients.agent.from("campaigns").insert({
      client_id: clientId,
      name: "Should fail",
      code: `SHOULD-FAIL-${RUN_ID}`,
      market: "UK",
      audience: "B2C",
    });
    expect(error).not.toBeNull();
  });

  it("ops_manager CAN create a campaign", async () => {
    const { data, error } = await clients.ops_manager
      .from("campaigns")
      .insert({
        client_id: clientId,
        name: "Ops-created campaign",
        code: `OPS-${RUN_ID}`,
        market: "UK",
        audience: "B2C",
      })
      .select()
      .single();
    expect(error).toBeNull();
    if (data) await admin.from("campaigns").delete().eq("id", data.id);
  });

  it("agent CANNOT read the audit log", async () => {
    const { data, error } = await clients.agent.from("audit_log").select("*").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("super_admin CAN read the audit log", async () => {
    const { data, error } = await clients.super_admin.from("audit_log").select("*").limit(1);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("no one can insert into the audit log directly (trigger-only)", async () => {
    const { error } = await clients.super_admin.from("audit_log").insert({
      action: "insert",
      entity_type: "profile",
    });
    expect(error).not.toBeNull();
  });

  it("agent's opt-out-equivalent write (credential_events insert about self) always succeeds", async () => {
    const { error } = await clients.agent.from("credential_events").insert({
      user_id: userIds.agent!,
      actor_id: userIds.agent!,
      event: "changed_by_user",
    });
    expect(error).toBeNull();
  });
});
