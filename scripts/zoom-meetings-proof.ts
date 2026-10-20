// `npm run test:zoommeetings` (tsx --conditions=react-server scripts/zoom-meetings-proof.ts).
//
// Proves the Zoom credentials + meetings feature against the live Supabase
// project and a LOCAL MOCK of Zoom (OAuth + the REST endpoints used). No real
// Zoom account is involved, so this proves our side of the contract only.
//
// Covers: Vault secret storage (service role only), token caching, create /
// get (fresh start_url) / delete flows through src/lib/zoom, RLS on
// zoom_meetings and zoom_credentials, cross-workspace denial, audit rows.
// Every row it creates is removed (credentials via clear_zoom_credentials,
// meetings/leads/test workspace by id). Run against staging, never production.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD } from "@/lib/seed/personas";

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

async function as(email: string) {
  const c: SupabaseClient<RealDatabase> = createClient<RealDatabase>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error || !data.user) throw new Error(`sign-in ${email}: ${error?.message}`);
  const { data: p } = await c.from("profiles").select("*").eq("id", data.user.id).single();
  return { c, profile: p! };
}

// ---------------------------------------------------------------- mock Zoom
const MOCK = { account: "mockacct1234", client: "mockclient1234", secret: "mock-secret-9876" };
const mock = { tokenRequests: 0, meetings: new Map<string, { topic: string; body: Record<string, unknown> }>(), nextId: 81000000000, lastCreate: null as null | Record<string, unknown>, ttl: 3600 };

function startMock(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body === undefined ? undefined : JSON.stringify(body));
      };
      if (u.pathname === "/oauth/token" && req.method === "POST") {
        mock.tokenRequests++;
        const basic = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
        if (u.searchParams.get("grant_type") !== "account_credentials" || u.searchParams.get("account_id") !== MOCK.account) {
          return send(400, { reason: "Invalid account", error: "invalid_request" });
        }
        if (basic !== `${MOCK.client}:${MOCK.secret}`) return send(401, { reason: "Invalid client_id or client_secret", error: "invalid_client" });
        return send(200, { access_token: `tok-${mock.tokenRequests}`, token_type: "bearer", expires_in: mock.ttl, scope: "meeting:write:meeting:admin" });
      }
      if (!(req.headers.authorization ?? "").startsWith("Bearer tok-")) return send(401, { code: 124, message: "Invalid access token." });
      const body = raw ? JSON.parse(raw) : {};
      if (u.pathname === "/v2/users/me" && req.method === "GET") return send(200, { id: "u1", email: "owner@mock.zoom", account_id: MOCK.account });
      let m = u.pathname.match(/^\/v2\/users\/([^/]+)\/meetings$/);
      if (m && req.method === "POST") {
        if (decodeURIComponent(m[1]).startsWith("nobody@")) return send(404, { code: 1001, message: `User does not exist: ${decodeURIComponent(m[1])}.` });
        const id = String(mock.nextId++);
        mock.meetings.set(id, { topic: body.topic, body });
        mock.lastCreate = body;
        return send(201, { id: Number(id), topic: body.topic, join_url: `https://mock.zoom.us/j/${id}?pwd=abc`, start_url: `https://mock.zoom.us/s/${id}?zak=fresh-${Date.now()}`, password: "123456" });
      }
      m = u.pathname.match(/^\/v2\/meetings\/(\d+)$/);
      if (m && req.method === "GET") {
        const found = mock.meetings.get(m[1]);
        if (!found) return send(404, { code: 3001, message: "Meeting does not exist." });
        return send(200, { id: Number(m[1]), topic: found.topic, join_url: `https://mock.zoom.us/j/${m[1]}?pwd=abc`, start_url: `https://mock.zoom.us/s/${m[1]}?zak=fresh-${Date.now()}`, password: "123456" });
      }
      if (m && req.method === "DELETE") {
        if (!mock.meetings.delete(m[1])) return send(404, { code: 3001, message: "Meeting does not exist." });
        return send(204);
      }
      send(404, { message: "not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

async function main() {
  const { port, close } = await startMock();
  process.env.ZOOM_OAUTH_BASE = `http://127.0.0.1:${port}`;
  process.env.ZOOM_API_BASE = `http://127.0.0.1:${port}/v2`;
  const { getZoomCredentials } = await import("@/lib/zoom/credentials");
  const zc = await import("@/lib/zoom/client");

  const admin = await as("admin@leadcallient.demo");
  const ops = await as("ops@leadcallient.demo");
  const lead = await as("teamlead@leadcallient.demo");
  const agent = await as("agent@leadcallient.demo");
  const personas = {
    leadgen: await as("leadgen@leadcallient.demo"),
    qa: await as("qa@leadcallient.demo"),
    client: await as("client@leadcallient.demo"),
  };
  const ws = admin.profile.workspace_id;

  const createdMeetings: string[] = [];
  let tempLead: string | null = null;
  let tempWs: string | null = null;
  let tempUser: string | null = null;

  try {
    const { data: existing } = await svc.from("zoom_credentials").select("workspace_id").eq("workspace_id", ws).maybeSingle();
    if (existing) throw new Error("demo workspace already has Zoom credentials; refusing to overwrite them");

    console.log("\n[credential storage]");
    const { error: setErr } = await svc.rpc("set_zoom_credentials", { p_workspace_id: ws, p_account_id: MOCK.account, p_client_id: MOCK.client, p_client_secret: MOCK.secret });
    check(!setErr, "service role can set credentials", setErr?.message);
    const { data: secret } = await svc.rpc("get_zoom_client_secret", { p_workspace_id: ws });
    check(secret === MOCK.secret, "service role reads the secret back from Vault");
    const { data: row0 } = await svc.from("zoom_credentials").select("*").eq("workspace_id", ws).single();
    check(!JSON.stringify(row0).includes(MOCK.secret), "the secret is not stored in the table row");
    check(row0?.status === "disconnected", "new credentials start disconnected");
    for (const [name, who] of [["admin", admin], ["ops", ops], ["agent", agent]] as const) {
      const r = await who.c.rpc("get_zoom_client_secret", { p_workspace_id: ws });
      check(!!r.error && !r.data, `${name} (authenticated) cannot call get_zoom_client_secret`);
      const s = await who.c.rpc("set_zoom_credentials", { p_workspace_id: ws, p_account_id: "x", p_client_id: "x", p_client_secret: "x" });
      check(!!s.error, `${name} cannot call set_zoom_credentials`);
    }
    const anonC = createClient<RealDatabase>(url, anon, { auth: { persistSession: false } });
    const ra = await anonC.rpc("get_zoom_client_secret", { p_workspace_id: ws });
    check(!!ra.error && !ra.data, "anon cannot call get_zoom_client_secret");
    const { error: colErr } = await admin.c.from("zoom_credentials").select("client_secret_id").eq("workspace_id", ws);
    check(!!colErr, "manager cannot select the client_secret_id column", colErr?.message);
    const { data: st } = await admin.c.from("zoom_credentials").select("account_id, client_id, status").eq("workspace_id", ws);
    check(st?.length === 1 && st[0].client_id === MOCK.client, "manager can read status/account_id/client_id");
    const { data: stOps } = await ops.c.from("zoom_credentials").select("status").eq("workspace_id", ws);
    check(stOps?.length === 1, "ops_manager can read credential status");
    for (const [name, who] of [["agent", agent], ["team_lead", lead], ["lead_gen", personas.leadgen], ["qa", personas.qa], ["client", personas.client]] as const) {
      const { data } = await who.c.from("zoom_credentials").select("status").eq("workspace_id", ws);
      check((data ?? []).length === 0, `${name} sees no credential rows`);
    }
    const upd = await admin.c.from("zoom_credentials").update({ status: "connected" }).eq("workspace_id", ws).select();
    check((upd.data ?? []).length === 0, "manager cannot update credentials through RLS client");

    console.log("\n[token fetch, caching, verification]");
    const creds = await getZoomCredentials(ws, { requireConnected: false });
    check(creds?.clientSecret === MOCK.secret, "getZoomCredentials returns decrypted secret server-side");
    check((await getZoomCredentials(ws)) === null, "getZoomCredentials(requireConnected) is null while disconnected");
    zc.clearZoomTokenCache();
    const me = await zc.verifyZoomCredentials(creds!);
    check(me.email === "owner@mock.zoom", "verify calls GET /users/me with the token");
    await svc.from("zoom_credentials").update({ status: "connected", verified_at: new Date().toISOString() }).eq("workspace_id", ws);
    const c = (await getZoomCredentials(ws))!;
    check(!!c, "connected credentials are returned");
    const before = mock.tokenRequests;
    zc.clearZoomTokenCache();
    const t1 = await zc.getZoomAccessToken(c);
    const t2 = await zc.getZoomAccessToken(c);
    check(t1 === t2 && mock.tokenRequests === before + 1, "token cached across calls (1 token request for 2 uses)");
    mock.ttl = 30; // below the 60s refresh margin: must not be reused
    zc.clearZoomTokenCache();
    await zc.getZoomAccessToken(c);
    const n = mock.tokenRequests;
    await zc.getZoomAccessToken(c);
    check(mock.tokenRequests === n + 1, "token expiring within 1 minute is refreshed");
    mock.ttl = 3600;
    zc.clearZoomTokenCache();
    let bad: unknown;
    try {
      await zc.getZoomAccessToken({ ...c, clientSecret: "wrong-secret" });
    } catch (e) {
      bad = e;
    }
    check(bad instanceof zc.ZoomError && (bad as InstanceType<typeof zc.ZoomError>).code === "auth", "wrong secret -> ZoomError auth");

    console.log("\n[schedule / start-url / cancel flows]");
    zc.clearZoomTokenCache();
    const start = new Date(Date.now() + 86_400_000);
    const z1 = await zc.createMeeting(c, { hostEmail: agent.profile.email, topic: "Proof meeting", startTime: start, durationMinutes: 30, timezone: "UTC", agenda: "proof" });
    const sent = mock.lastCreate as { type?: number; settings?: { auto_recording?: string; join_before_host?: boolean }; start_time?: string };
    check(sent.type === 2 && sent.settings?.auto_recording === "none" && !!sent.start_time, "create sends type 2, start_time, auto_recording none");
    check(!!z1.join_url && !!z1.start_url, "create returns join_url and start_url");
    const zi = await zc.createMeeting(c, { hostEmail: agent.profile.email, topic: "Instant", startTime: null, durationMinutes: 15, timezone: "UTC" });
    check((mock.lastCreate as { type?: number }).type === 1, "instant meeting sends type 1");
    await zc.deleteMeeting(c, String(zi.id));
    let nu: unknown;
    try {
      await zc.createMeeting(c, { hostEmail: "nobody@example.com", topic: "x", startTime: start, durationMinutes: 30, timezone: "UTC" });
    } catch (e) {
      nu = e;
    }
    check(nu instanceof zc.ZoomError && (nu as InstanceType<typeof zc.ZoomError>).code === "user_not_found", "unknown Zoom host -> user_not_found");

    // Mirror the server action: insert through the RLS client as the host.
    const insert = async (who: typeof agent, zoomId: string, extra: Partial<RealDatabaseInsert> = {}) => {
      const { data, error } = await who.c
        .from("zoom_meetings")
        .insert({
          workspace_id: ws, host_id: who.profile.id, created_by: who.profile.id, zoom_meeting_id: zoomId, topic: "Proof meeting",
          start_time: start.toISOString(), duration_minutes: 30, timezone: "UTC", join_url: `https://mock.zoom.us/j/${zoomId}`, ...extra,
        })
        .select("*")
        .single();
      if (data) createdMeetings.push(data.id);
      return { data, error };
    };
    type RealDatabaseInsert = import("@/lib/supabase/real-types").RealTablesInsert<"zoom_meetings">;

    const own = await insert(agent, String(z1.id));
    check(!!own.data && !own.error, "agent can insert a meeting they host", own.error?.message);
    check(own.data !== null && !("start_url" in own.data), "no start_url column/value is stored");
    check(!JSON.stringify(own.data).includes("zak="), "start_url token not present in stored row");

    const fresh1 = await zc.getMeeting(c, String(z1.id));
    await new Promise((r) => setTimeout(r, 5));
    const fresh2 = await zc.getMeeting(c, String(z1.id));
    check(!!fresh1.start_url && fresh1.start_url !== fresh2.start_url, "Start fetches a fresh start_url from Zoom every time");

    const forged = await agent.c.from("zoom_meetings").insert({
      workspace_id: ws, host_id: ops.profile.id, created_by: agent.profile.id, zoom_meeting_id: "1", topic: "x",
      start_time: start.toISOString(), duration_minutes: 30, join_url: "https://x",
    });
    check(!!forged.error, "agent cannot create a meeting hosted by someone else");

    await zc.deleteMeeting(c, String(z1.id));
    check(!mock.meetings.has(String(z1.id)), "cancel deletes the meeting in Zoom");
    await zc.deleteMeeting(c, String(z1.id)); // already gone: no throw
    check(true, "deleting an already-deleted Zoom meeting is tolerated");
    const { data: cancelled } = await agent.c.from("zoom_meetings").update({ status: "cancelled" }).eq("id", own.data!.id).select().single();
    check(cancelled?.status === "cancelled", "host marks the meeting cancelled");

    console.log("\n[RLS on zoom_meetings]");
    // ops hosts a meeting on a lead NOT assigned to the agent.
    const zOps = await zc.createMeeting(c, { hostEmail: ops.profile.email, topic: "Ops meeting", startTime: start, durationMinutes: 30, timezone: "UTC" });
    const opsM = await insert(ops, String(zOps.id), { topic: "Ops meeting" });
    check(!!opsM.data, "ops_manager can host a meeting", opsM.error?.message);

    // A lead assigned to the agent, meeting hosted by ops: agent should see it.
    const { data: ca } = await svc.from("campaign_assignments").select("campaign_id").eq("user_id", agent.profile.id).limit(1);
    const { data: tl, error: tlErr } = await svc
      .from("leads")
      .insert({ workspace_id: ws, campaign_id: ca?.[0]?.campaign_id ?? null, phone_e164: `+1555${String(Date.now()).slice(-7)}`, full_name: "ZoomProof Lead", assigned_to: agent.profile.id })
      .select("id")
      .single();
    if (tlErr) console.log("  note  temp lead insert failed:", tlErr.message);
    tempLead = tl?.id ?? null;
    if (tempLead) {
      const zLead = await zc.createMeeting(c, { hostEmail: ops.profile.email, topic: "On agent lead", startTime: start, durationMinutes: 30, timezone: "UTC" });
      const onLead = await insert(ops, String(zLead.id), { topic: "On agent lead", lead_id: tempLead });
      check(!!onLead.data, "meeting linked to a lead can be created", onLead.error?.message);
      const { data: seen } = await agent.c.from("zoom_meetings").select("id").eq("id", onLead.data!.id);
      check(seen?.length === 1, "agent sees a meeting on a lead assigned to them (hosted by someone else)");
    }
    const { data: agentSees } = await agent.c.from("zoom_meetings").select("id, host_id, lead_id");
    const ok = (agentSees ?? []).every((m) => m.host_id === agent.profile.id || (m.lead_id && m.lead_id === tempLead));
    check(ok, "agent sees only meetings they host or on their assigned leads");
    check(!(agentSees ?? []).some((m) => m.id === opsM.data!.id), "agent cannot see an ops meeting on an unrelated lead");
    check((await agent.c.from("zoom_meetings").update({ topic: "hijack" }).eq("id", opsM.data!.id).select()).data?.length === 0, "agent cannot update someone else's meeting");
    check((await agent.c.from("zoom_meetings").delete().eq("id", opsM.data!.id).select()).data?.length === 0, "nobody can delete via RLS client (no delete policy)");

    const { data: adminSees } = await admin.c.from("zoom_meetings").select("id").in("id", createdMeetings);
    check((adminSees ?? []).length === createdMeetings.length, "super_admin sees every meeting in the workspace");
    const { data: opsSees } = await ops.c.from("zoom_meetings").select("id").in("id", createdMeetings);
    check((opsSees ?? []).length === createdMeetings.length, "ops_manager sees every meeting in the workspace");

    const { data: tlSees } = await lead.c.from("zoom_meetings").select("id, host_id");
    const { data: teamIds } = await svc.from("profiles").select("id").eq("team_id", lead.profile.team_id ?? "00000000-0000-0000-0000-000000000000");
    const team = new Set((teamIds ?? []).map((p) => p.id));
    check((tlSees ?? []).every((m) => team.has(m.host_id)), "team_lead sees only meetings hosted by their team", { team: team.size, seen: tlSees?.length });
    for (const [name, who] of [["lead_gen", personas.leadgen], ["qa_analyst", personas.qa], ["client", personas.client]] as const) {
      const { data } = await who.c.from("zoom_meetings").select("id");
      check((data ?? []).length === 0, `${name} sees no meetings`);
      const ins = await who.c.from("zoom_meetings").insert({
        workspace_id: ws, host_id: who.profile.id, created_by: who.profile.id, zoom_meeting_id: "9", topic: "x",
        start_time: start.toISOString(), duration_minutes: 30, join_url: "https://x",
      });
      check(!!ins.error, `${name} cannot create meetings`);
    }

    console.log("\n[cross-workspace]");
    // Workspaces can never be deleted (their audit trail is permanent), so this
    // proof reuses one throwaway workspace across runs instead of creating a new
    // one each time. It is parked as 'canceled' between runs.
    let { data: w } = await svc.from("workspaces").select("id").eq("name", "zoomproof-tmp").order("created_at").limit(1).maybeSingle();
    if (!w) {
      const created = await svc.from("workspaces").insert({ name: "zoomproof-tmp", slug: `zoomproof-${Date.now()}` }).select("id").single();
      if (created.error || !created.data) throw new Error(`temp workspace: ${created.error?.message}`);
      w = created.data;
    }
    await svc.from("workspaces").update({ status: "active" }).eq("id", w.id);
    tempWs = w.id;
    const email = `zoomproof-${Date.now()}@leadcallient.demo`;
    const { data: u, error: uErr } = await svc.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
    if (uErr || !u.user) throw new Error(`temp user: ${uErr?.message}`);
    tempUser = u.user.id;
    const { error: pErr } = await svc.from("profiles").insert({ id: tempUser, workspace_id: tempWs, email, full_name: "Zoom Proof", role: "super_admin", must_change_password: false });
    if (pErr) throw new Error(`temp profile: ${pErr.message}`);
    const other = await as(email);
    const { data: osees } = await other.c.from("zoom_meetings").select("id");
    check((osees ?? []).length === 0, "another workspace's super_admin sees none of these meetings");
    const { data: ocred } = await other.c.from("zoom_credentials").select("workspace_id");
    check((ocred ?? []).length === 0, "another workspace's super_admin cannot see these credentials");
    const xi = await other.c.from("zoom_meetings").insert({
      workspace_id: ws, host_id: other.profile.id, created_by: other.profile.id, zoom_meeting_id: "8", topic: "x",
      start_time: start.toISOString(), duration_minutes: 30, join_url: "https://x",
    });
    check(!!xi.error, "cannot insert a meeting into another workspace");

    console.log("\n[audit]");
    const { data: aud } = await svc.from("audit_log").select("action, entity_type, entity_id, actor_id").eq("entity_type", "zoom_meeting").in("entity_id", createdMeetings);
    const actions = new Set((aud ?? []).map((a) => a.action));
    check(actions.has("insert") && actions.has("update"), "audit_log has insert and update rows for zoom_meeting", [...actions]);
    check((aud ?? []).some((a) => a.actor_id === agent.profile.id), "audit rows carry the acting user");
    const { data: caud } = await svc.from("audit_log").select("action, after_data").eq("entity_type", "zoom_credentials").eq("workspace_id", ws);
    check((caud ?? []).length >= 1, "audit_log has zoom_credentials rows");
    check(!JSON.stringify(caud).includes(MOCK.secret), "audit rows never contain the secret");
  } finally {
    console.log("\n[cleanup]");
    if (createdMeetings.length) {
      await svc.from("zoom_meetings").delete().in("id", createdMeetings);
      await svc.from("audit_log").delete().eq("entity_type", "zoom_meeting").in("entity_id", createdMeetings);
    }
    if (tempLead) {
      await svc.from("leads").delete().eq("id", tempLead);
      await svc.from("audit_log").delete().eq("entity_type", "lead").eq("entity_id", tempLead);
    }
    const { data: zrow } = await svc.from("zoom_credentials").select("id, workspace_id, account_id").eq("workspace_id", admin.profile.workspace_id).maybeSingle();
    if (zrow && zrow.account_id === MOCK.account) {
      await svc.rpc("clear_zoom_credentials", { p_workspace_id: zrow.workspace_id });
      await svc.from("audit_log").delete().eq("entity_type", "zoom_credentials").eq("entity_id", zrow.id);
    }
    if (tempUser) await svc.auth.admin.deleteUser(tempUser);
    if (tempWs) await svc.from("workspaces").update({ status: "canceled" }).eq("id", tempWs);
    const { data: left } = await svc.from("zoom_meetings").select("id").eq("workspace_id", admin.profile.workspace_id);
    const { data: leftC } = await svc.from("zoom_credentials").select("workspace_id").eq("workspace_id", admin.profile.workspace_id);
    check((left ?? []).length === 0 && (leftC ?? []).length === 0, "no zoom rows left behind in the demo workspace");
    close();
  }

  console.log(failures === 0 ? "\nZOOM PROOF PASSED" : `\nZOOM PROOF: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
