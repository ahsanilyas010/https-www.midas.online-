import { NextResponse } from "next/server";
import twilio from "twilio";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getWorkspaceApiKeyCredentials } from "@/lib/twilio/credentials";

const STAFF_ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "qa_analyst"];

// Mints a short-lived Twilio Voice AccessToken for the signed-in agent's
// browser softphone (spec: "/api/twilio/[workspaceId]/token mints a
// short-lived access token per authenticated agent"). incomingAllow only
// — agents never originate a call from the browser (device.connect());
// every call is server-initiated via the Twilio REST API
// (src/lib/actions/dialer-v2.ts's placeCall()), which is what rings the
// agent's registered Device as an incoming call.
export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const profile = await requireRealProfile();

  if (profile.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Not authorized for this workspace." }, { status: 403 });
  }
  if (!STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Only staff can use the dialer." }, { status: 403 });
  }

  const creds = await getWorkspaceApiKeyCredentials(workspaceId);
  if (!creds) {
    return NextResponse.json({ error: "Twilio is not connected for this workspace yet." }, { status: 409 });
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(creds.accountSid, creds.apiKeySid, creds.apiKeySecret, {
    identity: profile.id,
    ttl: 3600,
  });
  token.addGrant(new VoiceGrant({ incomingAllow: true }));

  return NextResponse.json({ token: token.toJwt(), identity: profile.id });
}
