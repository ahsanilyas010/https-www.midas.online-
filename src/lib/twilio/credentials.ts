import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface WorkspaceTwilioCredentials {
  accountSid: string;
  authToken: string;
  twimlAppSid: string | null;
  callerIdDefault: string | null;
}

// The only place outside migration 00000000000053_twilio_credentials_verification.sql
// that ever sees a decrypted Twilio auth token. Never log the return value
// (spec: "Never log ... Twilio secrets to console or error trackers").
export async function getWorkspaceTwilioCredentials(workspaceId: string): Promise<WorkspaceTwilioCredentials | null> {
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("twilio_credentials")
    .select("account_sid, twiml_app_sid, caller_id_default, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row || !row.account_sid || row.status !== "connected") return null;

  const { data: authToken, error } = await admin.rpc("get_twilio_auth_token", { p_workspace_id: workspaceId });
  if (error || !authToken) return null;

  return {
    accountSid: row.account_sid,
    authToken,
    twimlAppSid: row.twiml_app_sid,
    callerIdDefault: row.caller_id_default,
  };
}

export interface WorkspaceApiKeyCredentials {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
}

// For minting browser AccessTokens (src/app/api/twilio/[workspaceId]/token)
// — a separate credential pair from the Account SID/Auth Token above, per
// Twilio's own security model (an API Key can be individually revoked
// without rotating the account's main Auth Token).
export async function getWorkspaceApiKeyCredentials(workspaceId: string): Promise<WorkspaceApiKeyCredentials | null> {
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("twilio_credentials")
    .select("account_sid, api_key_sid, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row || !row.account_sid || !row.api_key_sid || row.status !== "connected") return null;

  const { data: secret, error } = await admin.rpc("get_twilio_api_key_secret", { p_workspace_id: workspaceId });
  if (error || !secret) return null;

  return { accountSid: row.account_sid, apiKeySid: row.api_key_sid, apiKeySecret: secret };
}
