"use server";

import twilio from "twilio";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { getWorkspaceTwilioCredentials } from "@/lib/twilio/credentials";
import { siteUrl } from "@/lib/site";

const STAFF_ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "qa_analyst"];

export interface PlaceCallResult {
  error?: string;
  callId?: string;
}

// Preview dialing (spec): the agent has already pulled this lead via
// next_lead_for_agent() and it's claimed by them. This creates the
// outbound call via the Twilio REST API — never the browser SDK's
// device.connect() — which rings the agent's registered Device as an
// incoming call; the /voice webhook then bridges that leg to the lead
// once answered.
export async function placeCall(leadId: string): Promise<PlaceCallResult> {
  const profile = await requireRealProfile();
  if (!STAFF_ROLES.includes(profile.role)) {
    return { error: "Only staff can place calls." };
  }

  const workspace = await getCurrentWorkspace();
  // Spec: "A workspace with status suspended can log in but cannot dial."
  // Every other real surface (browsing leads, QA, performance) stays
  // reachable — only the actual outbound call is blocked, here, at the
  // one function that's the sole path to placing one.
  if (workspace.status === "suspended") {
    return { error: "This workspace is suspended. Contact support to resume calling." };
  }

  const supabase = await createRealClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("workspace_id", workspace.id).maybeSingle();
  if (!lead) return { error: "Lead not found." };
  if (lead.claimed_by !== profile.id) return { error: "This lead isn't claimed by you — pull your next lead first." };
  if (!lead.phone_e164) return { error: "This lead has no phone number." };

  const creds = await getWorkspaceTwilioCredentials(workspace.id);
  if (!creds) return { error: "Twilio isn't connected yet. Connect it under Integrations." };

  const { data: campaign } = lead.campaign_id
    ? await supabase.from("campaigns").select("caller_id, recording_enabled").eq("id", lead.campaign_id).maybeSingle()
    : { data: null };
  const callerId = campaign?.caller_id || creds.callerIdDefault;
  if (!callerId) return { error: "No caller ID is set. Choose a number under Integrations or the campaign settings." };

  const client = twilio(creds.accountSid, creds.authToken);
  const base = siteUrl();

  let created: Awaited<ReturnType<typeof client.calls.create>>;
  try {
    created = await client.calls.create({
      to: `client:${profile.id}`,
      from: callerId,
      url: `${base}/api/twilio/${workspace.id}/voice?leadId=${leadId}&callerId=${encodeURIComponent(callerId)}&record=${campaign?.recording_enabled ? "1" : "0"}`,
      statusCallback: `${base}/api/twilio/${workspace.id}/status`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });
  } catch (e) {
    // Never log the raw Twilio error verbatim — it can echo back request
    // params (including the lead's phone number).
    return { error: e instanceof Error ? "Could not place the call. Check the caller ID and Twilio account status." : "Could not place the call." };
  }

  const admin = createServiceClient();
  const { data: call, error } = await admin
    .from("calls")
    .insert({
      workspace_id: workspace.id,
      lead_id: leadId,
      campaign_id: lead.campaign_id,
      agent_id: profile.id,
      provider_call_sid: created.sid,
      from_number: callerId,
      to_number: lead.phone_e164,
      status: "initiated",
    })
    .select("id")
    .single();
  if (error || !call) return { error: error?.message ?? "Could not record the call." };

  return { callId: call.id };
}
