import "server-only";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/service";

// Every Twilio webhook route validates the request signature with that
// workspace's OWN auth token (spec: "Validate the Twilio signature with
// that workspace's auth token") — never a shared/global secret. Returns
// the parsed form params on success, null on a bad or unverifiable
// signature (the caller should respond 403).
export async function validateTwilioRequest(workspaceId: string, request: Request): Promise<URLSearchParams | null> {
  const admin = createServiceClient();
  const { data: authToken, error } = await admin.rpc("get_twilio_auth_token", { p_workspace_id: workspaceId });
  if (error || !authToken) return null;

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return null;

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const paramsObject: Record<string, string> = {};
  for (const [key, value] of params) paramsObject[key] = value;

  const valid = twilio.validateRequest(authToken, signature, request.url, paramsObject);
  return valid ? params : null;
}
