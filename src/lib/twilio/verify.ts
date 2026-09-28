import "server-only";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/service";

export interface VerifyResult {
  ok: boolean;
  error?: string;
  numbersFound?: number;
}

// Spec: "Verify credentials on save with a test API call and list owned
// numbers." Called right after set_twilio_credentials() stores the
// encrypted token. Never logs the account SID/token pair together with
// the error detail — just a short message safe to show the admin.
export async function verifyTwilioCredentials(workspaceId: string, accountSid: string, authToken: string): Promise<VerifyResult> {
  const admin = createServiceClient();
  const client = twilio(accountSid, authToken);

  try {
    await client.api.v2010.accounts(accountSid).fetch();
  } catch {
    await admin
      .from("twilio_credentials")
      .update({ status: "error", last_error: "Could not authenticate with Twilio — check the Account SID and Auth Token." })
      .eq("workspace_id", workspaceId);
    return { ok: false, error: "Could not authenticate with Twilio — check the Account SID and Auth Token." };
  }

  let numbers: Awaited<ReturnType<typeof client.incomingPhoneNumbers.list>>;
  try {
    numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
  } catch {
    await admin
      .from("twilio_credentials")
      .update({ status: "error", last_error: "Connected, but couldn't list owned phone numbers." })
      .eq("workspace_id", workspaceId);
    return { ok: false, error: "Connected, but couldn't list owned phone numbers." };
  }

  await admin.from("twilio_numbers").delete().eq("workspace_id", workspaceId);
  if (numbers.length > 0) {
    await admin.from("twilio_numbers").insert(
      numbers.map((n) => ({
        workspace_id: workspaceId,
        phone_number: n.phoneNumber,
        friendly_name: n.friendlyName,
        capabilities: n.capabilities as unknown as Record<string, boolean>,
      })),
    );
  }

  await admin
    .from("twilio_credentials")
    .update({
      status: "connected",
      verified_at: new Date().toISOString(),
      last_error: null,
      caller_id_default: numbers[0]?.phoneNumber ?? null,
    })
    .eq("workspace_id", workspaceId);

  // Auto-provision an API Key/Secret for the browser softphone's
  // AccessToken (spec's CREDENTIAL MODEL: "API Key, API Secret") — one
  // less manual step in the Twilio console for a new workspace. Only
  // created once; re-verifying an already-connected workspace reuses it.
  const { data: existing } = await admin.from("twilio_credentials").select("api_key_sid").eq("workspace_id", workspaceId).maybeSingle();
  if (!existing?.api_key_sid) {
    try {
      const key = await client.newKeys.create({ friendlyName: "LeadCallient dialer" });
      await admin.rpc("set_twilio_api_key", { p_workspace_id: workspaceId, p_api_key_sid: key.sid, p_api_key_secret: key.secret });
    } catch {
      // Non-fatal: the workspace is still "connected" for calling
      // purposes; the browser softphone just won't have a token to mint
      // until this is retried (re-saving the credentials retries it).
    }
  }

  return { ok: true, numbersFound: numbers.length };
}
