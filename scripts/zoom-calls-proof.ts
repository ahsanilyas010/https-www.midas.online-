// `npm run test:zoomcalls` (tsx scripts/zoom-calls-proof.ts).
//
// Proves the Zoom Phone call-tracking data path against the live demo
// workspace as the seeded agent persona: the claim -> calls-row creation
// startCall() does, the event state machine (the SAME pure module the
// recordZoomCallEvent server action uses), illegal transitions, number
// matching, and that another agent / the agent's own RLS client cannot
// update the row. Next-only code (server actions) is not importable here, so
// the DB writes below mirror the action's queries; the transition decisions
// come from src/lib/zoom-phone/call-state.ts.
//
// NOT proven here: the Zoom iframe / postMessage flow itself (needs a real
// Zoom Phone account). Cleans up everything it creates.

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD, DEMO_PERSONAS } from "@/lib/seed/personas";
import {
  applyZoomEvent,
  sameNumber,
  isZoomUrl,
  type CallRowState,
  type CallStatus,
  type ZoomCallEvent,
} from "@/lib/zoom-phone/call-state";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok    ${label}`);
  else {
    console.error(`  FAIL  ${label}${detail ? ` - ${String(detail)}` : ""}`);
    failures++;
  }
}

const NUMBER = "+15559990101";
const ZOOM_ID = "zoom-proof-call-1";

async function main() {
  if (!url || !anonKey || !serviceKey) {
    console.error("zoom-calls-proof: Supabase env vars must be set.");
    process.exit(1);
  }
  const admin: SupabaseClient<RealDatabase> = createClient<RealDatabase>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: workspace } = await admin.from("workspaces").select("id, demo_allowed_numbers").eq("slug", "demo").single();
  if (!workspace) {
    console.error("zoom-calls-proof: run `npm run seed` first.");
    process.exit(1);
  }
  const agentPersona = DEMO_PERSONAS.find((p) => p.role === "agent")!;
  const otherPersona = DEMO_PERSONAS.find((p) => p.role === "team_lead")!;
  const { data: agent } = await admin.from("profiles").select("id").eq("workspace_id", workspace.id).eq("email", agentPersona.email).single();
  const { data: other } = await admin.from("profiles").select("id").eq("workspace_id", workspace.id).eq("email", otherPersona.email).single();
  if (!agent || !other) throw new Error("demo personas missing");

  const originalAllowed = workspace.demo_allowed_numbers ?? [];
  await admin.from("workspaces").update({ demo_allowed_numbers: [...originalAllowed, NUMBER] }).eq("id", workspace.id);

  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .insert({ workspace_id: workspace.id, name: "Zoom Calls Proof (throwaway)", max_attempts: 3, cooling_off_hours: 24, caller_id: "+15550001111" })
    .select("*")
    .single();
  if (cErr || !campaign) throw cErr ?? new Error("campaign");
  await admin.from("campaign_assignments").insert({ workspace_id: workspace.id, campaign_id: campaign.id, user_id: agent.id });
  const { data: lead, error: lErr } = await admin
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      campaign_id: campaign.id,
      phone_e164: NUMBER,
      full_name: "Zoom Proof Lead",
      screening_status: "passed",
      screened_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (lErr || !lead) throw lErr ?? new Error("lead");
  await admin.from("suppression_list").delete().eq("workspace_id", workspace.id).eq("phone_hash", lead.phone_hash!);

  const agentClient = createClient<RealDatabase>(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: siErr } = await agentClient.auth.signInWithPassword({ email: agentPersona.email, password: DEMO_PASSWORD });
  if (siErr) throw new Error(`sign in failed: ${siErr.message}`);

  const callIds: string[] = [];
  try {
    console.log("1. startCall-equivalent");
    const { data: pulled } = await agentClient.rpc("next_lead_for_agent", { p_agent_id: agent.id });
    check("agent pulls the throwaway lead through the compliance gate", pulled?.id === lead.id, pulled?.id);
    const { data: claimed } = await agentClient.from("leads").select("claimed_by, phone_e164").eq("id", lead.id).single();
    check("lead is claimed by the agent (RLS client can read it)", claimed?.claimed_by === agent.id);

    const { data: call, error: insErr } = await admin
      .from("calls")
      .insert({
        workspace_id: workspace.id,
        lead_id: lead.id,
        campaign_id: campaign.id,
        agent_id: agent.id,
        provider: "zoom",
        from_number: campaign.caller_id,
        to_number: lead.phone_e164,
        status: "initiated",
      })
      .select("*")
      .single();
    check("calls row created with status initiated", !insErr && call?.status === "initiated" && call.provider === "zoom", insErr?.message);
    if (!call) throw new Error("no call row");
    callIds.push(call.id);

    const { error: directErr, data: directUpd } = await agentClient.from("calls").update({ status: "completed" }).eq("id", call.id).select("id");
    const { data: afterDirect } = await admin.from("calls").select("status").eq("id", call.id).single();
    check(
      "agent's RLS client cannot update calls directly",
      (directUpd ?? []).length === 0 && afterDirect?.status === "initiated",
      directErr?.message,
    );

    console.log("\n2. Number matching");
    check("E.164 matches Zoom's formatted number", sameNumber(NUMBER, "+1 (555) 999-0101"));
    check("a different number does not match", !sameNumber(NUMBER, "+1 555 999 0102"));

    async function load(id: string): Promise<CallRowState> {
      const { data } = await admin.from("calls").select("*").eq("id", id).single();
      return {
        status: data!.status as CallStatus,
        zoom_call_id: data!.zoom_call_id,
        zoom_call_log_id: data!.zoom_call_log_id,
        answered_at: data!.answered_at,
        ended_at: data!.ended_at,
        duration_seconds: data!.duration_seconds,
        recording_url: data!.recording_url,
        ai_summary: (data!.ai_summary as CallRowState["ai_summary"]) ?? null,
      };
    }

    // Mirrors recordZoomCallEvent's guarded update.
    async function apply(id: string, ev: ZoomCallEvent, asAgent = agent!.id) {
      const row = await load(id);
      const t = applyZoomEvent(row, ev);
      if (!t.ok) return { applied: false as const, reason: t.reason };
      const { data: upd } = await admin
        .from("calls")
        .update(t.patch as never)
        .eq("id", id)
        .eq("workspace_id", workspace!.id)
        .eq("agent_id", asAgent)
        .eq("status", row.status)
        .select("id");
      return { applied: (upd ?? []).length === 1, reason: "" };
    }

    console.log("\n3. Event state machine (happy path)");
    let r = await apply(call.id, { type: "ringing", zoomCallId: ZOOM_ID });
    let row = await load(call.id);
    check("ringing -> status ringing, zoom id bound", r.applied && row.status === "ringing" && row.zoom_call_id === ZOOM_ID);
    r = await apply(call.id, { type: "ringing", zoomCallId: ZOOM_ID });
    check("duplicate ringing is an idempotent no-op", r.applied && (await load(call.id)).status === "ringing");
    r = await apply(call.id, { type: "connected", zoomCallId: ZOOM_ID });
    row = await load(call.id);
    check("connected -> in-progress with answered_at", r.applied && row.status === "in-progress" && !!row.answered_at);
    r = await apply(call.id, { type: "ended", zoomCallId: ZOOM_ID, result: "ended" });
    row = await load(call.id);
    check("ended(ended) after connect -> completed with ended_at", r.applied && row.status === "completed" && !!row.ended_at);
    r = await apply(call.id, { type: "log-completed", zoomCallId: ZOOM_ID, zoomCallLogId: "log-1", durationSeconds: 125 });
    row = await load(call.id);
    check("log-completed stores call log id + duration", r.applied && row.zoom_call_log_id === "log-1" && row.duration_seconds === 125);
    r = await apply(call.id, {
      type: "recording-completed",
      zoomCallId: ZOOM_ID,
      zoomCallLogId: "log-1",
      recordingUrl: "https://applications.zoom.us/rec/play/abc",
    });
    row = await load(call.id);
    check("recording-completed stores the Zoom recording URL", r.applied && row.recording_url === "https://applications.zoom.us/rec/play/abc");
    r = await apply(call.id, {
      type: "ai-summary",
      zoomCallId: ZOOM_ID,
      summary: { callSummary: "Short recap", nextSteps: "Send quote", detailedSummary: "Long form" },
    });
    row = await load(call.id);
    check("ai summary stored as jsonb", r.applied && row.ai_summary?.callSummary === "Short recap");

    console.log("\n4. Illegal transitions are rejected");
    r = await apply(call.id, { type: "ringing", zoomCallId: ZOOM_ID });
    check("completed -> ringing rejected", !r.applied && (await load(call.id)).status === "completed", r.reason);
    r = await apply(call.id, { type: "connected", zoomCallId: ZOOM_ID });
    check("completed -> in-progress rejected", !r.applied && (await load(call.id)).status === "completed", r.reason);
    r = await apply(call.id, { type: "ended", zoomCallId: ZOOM_ID, result: "missed" });
    check("completed -> no-answer rejected", !r.applied && (await load(call.id)).status === "completed", r.reason);
    r = await apply(call.id, { type: "connected", zoomCallId: "some-other-zoom-call" });
    check("event for a different Zoom call id rejected", !r.applied, r.reason);
    r = await apply(call.id, { type: "log-completed", zoomCallId: ZOOM_ID, zoomCallLogId: "log-2", durationSeconds: 5 });
    check("a second, different call log id is rejected", !r.applied, r.reason);
    check("non-Zoom recording URL is rejected", !isZoomUrl("https://evil.example.com/x.mp3") && !isZoomUrl("http://zoom.us/x") && !isZoomUrl("javascript:alert(1)"));

    console.log("\n5. Outcome mapping for calls that never connect");
    for (const [result, expected] of [
      ["missed", "no-answer"],
      ["rejected", "failed"],
      ["ended", "canceled"],
    ] as const) {
      const { data: c2 } = await admin
        .from("calls")
        .insert({ workspace_id: workspace.id, lead_id: lead.id, campaign_id: campaign.id, agent_id: agent.id, provider: "zoom", to_number: NUMBER, status: "initiated" })
        .select("id")
        .single();
      callIds.push(c2!.id);
      await apply(c2!.id, { type: "ringing", zoomCallId: `zoom-proof-${result}` });
      await apply(c2!.id, { type: "ended", zoomCallId: `zoom-proof-${result}`, result });
      check(`ended(${result}) without connect -> ${expected}`, (await load(c2!.id)).status === expected);
      const rr = await apply(c2!.id, { type: "recording-completed", zoomCallId: `zoom-proof-${result}`, zoomCallLogId: null, recordingUrl: "https://zoom.us/x" });
      check(`recording for never-connected (${result}) call rejected`, !rr.applied);
    }

    console.log("\n6. Cross-agent / cross-workspace isolation");
    const { data: crossRead } = await admin
      .from("calls")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("agent_id", other.id)
      .eq("zoom_call_id", ZOOM_ID);
    check("another agent's lookup by Zoom call id finds nothing", (crossRead ?? []).length === 0);
    const { data: crossUpd } = await admin
      .from("calls")
      .update({ status: "failed" })
      .eq("id", call.id)
      .eq("workspace_id", workspace.id)
      .eq("agent_id", other.id)
      .select("id");
    check("another agent's guarded update touches 0 rows", (crossUpd ?? []).length === 0 && (await load(call.id)).status === "completed");
    const { data: wrongWs } = await admin
      .from("calls")
      .update({ status: "failed" })
      .eq("id", call.id)
      .eq("workspace_id", "00000000-0000-0000-0000-000000000000")
      .eq("agent_id", agent.id)
      .select("id");
    check("a different workspace id touches 0 rows", (wrongWs ?? []).length === 0);

    console.log("\n7. Disposition still links to the call row");
    const { error: recErr } = await agentClient.rpc("record_call_attempt", { p_lead_id: lead.id, p_disposition_code: "no_answer" });
    const { data: linked } = await admin.from("calls").select("id, disposition_id").eq("lead_id", lead.id).not("disposition_id", "is", null);
    check("record_call_attempt succeeds and links a disposition to a Zoom call row", !recErr && (linked ?? []).length >= 1, recErr?.message);
  } finally {
    await admin.from("calls").delete().eq("lead_id", lead.id);
    await admin.from("callbacks").delete().eq("lead_id", lead.id);
    await admin.from("suppression_list").delete().eq("workspace_id", workspace.id).eq("phone_hash", lead.phone_hash!);
    await admin.from("leads").delete().eq("id", lead.id);
    await admin.from("campaign_assignments").delete().eq("campaign_id", campaign.id);
    await admin.from("campaigns").delete().eq("id", campaign.id);
    await admin.from("workspaces").update({ demo_allowed_numbers: originalAllowed }).eq("id", workspace.id);
    console.log("\ncleaned up throwaway rows");
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll Zoom call checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
