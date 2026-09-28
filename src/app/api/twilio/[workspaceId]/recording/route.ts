import { NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/service";
import { validateTwilioRequest } from "@/lib/twilio/validate-request";
import { getWorkspaceTwilioCredentials } from "@/lib/twilio/credentials";

// Spec: "Recording callback downloads the file into Supabase Storage
// under the workspace path, stores the path on the call row, then deletes
// it from Twilio. Honour campaign.recording_enabled" (enforced upstream —
// this route only ever fires when the /voice webhook asked for one).
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const validated = await validateTwilioRequest(workspaceId, request);
  if (!validated) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const callSid = validated.get("CallSid");
  const recordingSid = validated.get("RecordingSid");
  const recordingUrl = validated.get("RecordingUrl");
  if (!callSid || !recordingSid || !recordingUrl) {
    return NextResponse.json({ received: true });
  }

  const admin = createServiceClient();
  const { data: call } = await admin
    .from("calls")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider_call_sid", callSid)
    .maybeSingle();
  if (!call) return NextResponse.json({ received: true });

  const creds = await getWorkspaceTwilioCredentials(workspaceId);
  if (!creds) return NextResponse.json({ received: true });

  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  const mediaRes = await fetch(`${recordingUrl}.mp3`, { headers: { Authorization: `Basic ${auth}` } });
  if (!mediaRes.ok) return NextResponse.json({ received: true });

  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  const path = `${workspaceId}/${call.id}.mp3`;
  const { error: uploadError } = await admin.storage
    .from("call-recordings")
    .upload(path, buffer, { contentType: "audio/mpeg", upsert: true });
  if (uploadError) return NextResponse.json({ received: true });

  await admin.from("calls").update({ recording_sid: recordingSid, recording_path: path }).eq("id", call.id);

  try {
    const client = twilio(creds.accountSid, creds.authToken);
    await client.recordings(recordingSid).remove();
  } catch {
    // Non-fatal — the recording is already safely in Storage. A stray
    // copy left on Twilio is a retention/cost concern, not a correctness
    // one, and shouldn't fail this webhook's 200 response.
  }

  return NextResponse.json({ received: true });
}
