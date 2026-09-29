import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateTwilioRequest } from "@/lib/twilio/validate-request";
import type { RealTables } from "@/lib/supabase/real-types";

type CallStatus = RealTables<"calls">["status"];

// Twilio's status-callback statuses map onto calls.status's check
// constraint (migration 00000000000054) almost 1:1; "queued" is the one
// mismatch.
const STATUS_MAP: Record<string, CallStatus> = {
  queued: "initiated",
  initiated: "initiated",
  ringing: "ringing",
  "in-progress": "in-progress",
  completed: "completed",
  busy: "busy",
  "no-answer": "no-answer",
  failed: "failed",
  canceled: "canceled",
};

// Updates the matching calls row and emits a Realtime event via the
// row's own UPDATE (any client subscribed to workspace-scoped calls
// changes, e.g. the live floor in a later phase, picks it up automatically
// — no separate broadcast needed).
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const validated = await validateTwilioRequest(workspaceId, request);
  if (!validated) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const callSid = validated.get("CallSid");
  const rawStatus = validated.get("CallStatus");
  if (!callSid || !rawStatus) {
    return NextResponse.json({ received: true });
  }

  const status: CallStatus = STATUS_MAP[rawStatus] ?? "failed";
  const admin = createServiceClient();

  const update: { status: CallStatus; ended_at?: string; answered_at?: string } = { status };
  if (status === "completed" || status === "busy" || status === "no-answer" || status === "failed" || status === "canceled") {
    update.ended_at = new Date().toISOString();
  }
  if (status === "in-progress") {
    // First "answered" transition only — talk-time math (v_agent_scorecard,
    // migration 059) depends on this being set once, not overwritten on
    // every subsequent in-progress callback Twilio might send.
    const { data: existing } = await admin
      .from("calls")
      .select("answered_at")
      .eq("workspace_id", workspaceId)
      .eq("provider_call_sid", callSid)
      .maybeSingle();
    if (!existing?.answered_at) update.answered_at = new Date().toISOString();
  }

  await admin.from("calls").update(update).eq("workspace_id", workspaceId).eq("provider_call_sid", callSid);

  return NextResponse.json({ received: true });
}
