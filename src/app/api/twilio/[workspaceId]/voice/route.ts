import { NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/service";
import { validateTwilioRequest } from "@/lib/twilio/validate-request";
import { siteUrl } from "@/lib/site";

const { VoiceResponse } = twilio.twiml;

function xmlResponse(twiml: InstanceType<typeof VoiceResponse>) {
  return new NextResponse(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}

// Twilio fetches this once the agent's browser Device answers the
// incoming leg placeCall() created (src/lib/actions/dialer-v2.ts). Spec:
// "TwiML connects agent to lead." Never logs the lead's phone number —
// it's read here and handed straight to <Dial>, not written anywhere.
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const callerId = url.searchParams.get("callerId");
  const record = url.searchParams.get("record") === "1";

  const validated = await validateTwilioRequest(workspaceId, request);
  if (!validated) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const twiml = new VoiceResponse();
  if (!leadId || !callerId) {
    twiml.say("This call could not be connected. Goodbye.");
    twiml.hangup();
    return xmlResponse(twiml);
  }

  const admin = createServiceClient();
  const { data: lead } = await admin.from("leads").select("phone_e164").eq("id", leadId).eq("workspace_id", workspaceId).maybeSingle();

  if (!lead?.phone_e164) {
    twiml.say("This lead could not be found. Goodbye.");
    twiml.hangup();
    return xmlResponse(twiml);
  }

  const dial = twiml.dial({
    callerId,
    ...(record
      ? {
          record: "record-from-answer",
          recordingStatusCallback: `${siteUrl()}/api/twilio/${workspaceId}/recording`,
          recordingStatusCallbackMethod: "POST",
          recordingStatusCallbackEvent: ["completed"],
        }
      : {}),
  });
  dial.number(lead.phone_e164);

  return xmlResponse(twiml);
}
