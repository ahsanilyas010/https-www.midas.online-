// Pure call-lifecycle state machine for Zoom Phone Smart Embed events.
// No Next/Supabase imports so scripts/zoom-calls-proof.ts can exercise the
// exact logic the server action uses.
//
// HONESTY NOTE: these events originate in the agent's browser (Zoom's iframe
// -> window.postMessage -> our server action). The server verifies WHO sent
// them (the signed-in agent, and that the call row is theirs) but cannot
// verify the events themselves are genuine. A malicious agent could forge
// them. Zoom webhooks are the future hardening; until then treat durations,
// recording links and summaries as agent-reported.

export type CallStatus =
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";

export const TERMINAL_STATUSES: CallStatus[] = ["completed", "busy", "no-answer", "failed", "canceled"];

export function isTerminal(s: CallStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

export interface CallRowState {
  status: CallStatus;
  zoom_call_id: string | null;
  zoom_call_log_id: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  ai_summary: AiSummary | null;
}

export interface AiSummary {
  callSummary: string | null;
  nextSteps: string | null;
  detailedSummary: string | null;
}

export type ZoomCallEvent =
  | { type: "ringing"; zoomCallId: string }
  | { type: "connected"; zoomCallId: string }
  | { type: "ended"; zoomCallId: string; result: "missed" | "rejected" | "ended" }
  | { type: "log-completed"; zoomCallId: string; zoomCallLogId: string; durationSeconds: number | null }
  | { type: "recording-completed"; zoomCallId: string; zoomCallLogId: string | null; recordingUrl: string }
  | { type: "ai-summary"; zoomCallId: string; summary: AiSummary };

export type CallPatch = Partial<
  Pick<
    CallRowState,
    | "status"
    | "zoom_call_id"
    | "zoom_call_log_id"
    | "answered_at"
    | "ended_at"
    | "duration_seconds"
    | "recording_url"
    | "ai_summary"
  >
>;

export type Transition = { ok: true; patch: CallPatch } | { ok: false; reason: string };

const RANK: Record<CallStatus, number> = {
  initiated: 0,
  ringing: 1,
  "in-progress": 2,
  completed: 3,
  busy: 3,
  "no-answer": 3,
  failed: 3,
  canceled: 3,
};

// Zoom recording links must point at Zoom itself: this value is rendered as a
// link for managers/QA, and the event is browser-reported.
export function isZoomUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return u.hostname === "zoom.us" || u.hostname.endsWith(".zoom.us") || u.hostname === "zoom.com" || u.hostname.endsWith(".zoom.com");
  } catch {
    return false;
  }
}

export function digitsOnly(n: string): string {
  return n.replace(/\D/g, "");
}

// Zoom echoes the number in its own format ("+1 415 555 0123", "4155550123").
export function sameNumber(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const n = Math.min(da.length, db.length, 10);
  return n >= 7 && da.slice(-n) === db.slice(-n);
}

export function clampDuration(sec: number | null): number | null {
  if (sec === null || !Number.isFinite(sec)) return null;
  return Math.max(0, Math.min(86_400, Math.round(sec)));
}

export function applyZoomEvent(row: CallRowState, ev: ZoomCallEvent, now: Date = new Date()): Transition {
  if (row.zoom_call_id && row.zoom_call_id !== ev.zoomCallId) {
    return { ok: false, reason: "event belongs to a different Zoom call" };
  }
  const bind: CallPatch = row.zoom_call_id ? {} : { zoom_call_id: ev.zoomCallId };
  const iso = now.toISOString();

  switch (ev.type) {
    case "ringing": {
      if (RANK[row.status] > RANK.ringing) return { ok: false, reason: `illegal transition ${row.status} -> ringing` };
      return { ok: true, patch: { ...bind, status: "ringing" } };
    }
    case "connected": {
      if (isTerminal(row.status)) return { ok: false, reason: `illegal transition ${row.status} -> in-progress` };
      return { ok: true, patch: { ...bind, status: "in-progress", answered_at: row.answered_at ?? iso } };
    }
    case "ended": {
      if (isTerminal(row.status)) return { ok: false, reason: `call already ${row.status}` };
      let status: CallStatus;
      if (ev.result === "missed") status = "no-answer";
      else if (ev.result === "rejected") status = "failed";
      else status = row.status === "in-progress" ? "completed" : "canceled";
      return { ok: true, patch: { ...bind, status, ended_at: row.ended_at ?? iso } };
    }
    case "log-completed": {
      const duration = clampDuration(ev.durationSeconds);
      const patch: CallPatch = { ...bind, zoom_call_log_id: ev.zoomCallLogId };
      if (row.zoom_call_log_id && row.zoom_call_log_id !== ev.zoomCallLogId) {
        return { ok: false, reason: "call log id already set to a different value" };
      }
      if (duration !== null) patch.duration_seconds = duration;
      if (!isTerminal(row.status)) {
        // The ended event was missed: infer the outcome from the log.
        patch.status = duration && duration > 0 ? "completed" : "no-answer";
        patch.ended_at = row.ended_at ?? iso;
        if (patch.status === "completed") patch.answered_at = row.answered_at ?? iso;
      }
      return { ok: true, patch };
    }
    case "recording-completed": {
      if (!isZoomUrl(ev.recordingUrl)) return { ok: false, reason: "recording URL is not a Zoom https URL" };
      if (!row.answered_at) return { ok: false, reason: "recording for a call that never connected" };
      const patch: CallPatch = { ...bind, recording_url: ev.recordingUrl };
      if (ev.zoomCallLogId && !row.zoom_call_log_id) patch.zoom_call_log_id = ev.zoomCallLogId;
      return { ok: true, patch };
    }
    case "ai-summary": {
      if (!row.answered_at) return { ok: false, reason: "summary for a call that never connected" };
      return { ok: true, patch: { ...bind, ai_summary: ev.summary } };
    }
  }
}
