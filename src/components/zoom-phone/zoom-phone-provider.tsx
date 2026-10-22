"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Phone } from "lucide-react";
import { recordZoomCallEvent, type RecordZoomCallEventInput } from "@/lib/actions/zoom-calls";

// Zoom Phone Smart Embed host. One iframe for the whole signed-in app (dial
// roles only) so a call survives page navigation. Docs:
// https://developers.zoom.us/docs/phone/smart-embed-guide.md
//
// Agents sign in to Zoom INSIDE the iframe; we never see Zoom credentials.
// Events from the iframe are forwarded to recordZoomCallEvent(). Those events
// come from the browser and are not server-verified (see that action).

const ZOOM_ORIGIN = "https://applications.zoom.us";
const IFRAME_SRC = `${ZOOM_ORIGIN}/integration/phone/embeddablephone/home`;
const IFRAME_ID = "zoom-embeddable-phone-iframe";
const READY_TIMEOUT_MS = 15_000;

// "sign-in": the Zoom panel has loaded but has not reported ready, which in
// practice means Zoom is showing its own sign-in screen (or an admin step is
// missing; see setupHint).
export type PhoneStatus = "idle" | "loading" | "sign-in" | "ready" | "on-call" | "unavailable";

export type ActiveCallState = "dialing" | "ringing" | "connected" | "ended";

export interface ActiveCall {
  callId: string | null;
  number: string;
  state: ActiveCallState;
  // Set once the call ends: missed | rejected | ended
  result: "missed" | "rejected" | "ended" | null;
}

interface PhoneApi {
  ready: boolean;
  status: PhoneStatus;
  // True once the panel has been mounted for ~15s without reporting ready:
  // the Zoom admin prerequisites probably aren't done.
  setupHint: boolean;
  activeCall: ActiveCall | null;
  makeCall: (number: string, callId?: string | null, callerId?: string | null) => boolean;
  clearCall: () => void;
}

const DEFAULT: PhoneApi = {
  ready: false,
  status: "idle",
  setupHint: false,
  activeCall: null,
  makeCall: () => false,
  clearCall: () => {},
};

const PhoneContext = createContext<PhoneApi>(DEFAULT);

export function usePhone(): PhoneApi {
  return useContext(PhoneContext);
}

type ZoomMessage = { id?: string; type?: string; data?: Record<string, unknown> };

export const PHONE_LABEL: Record<PhoneStatus, string> = {
  idle: "Starting...",
  loading: "Starting...",
  "sign-in": "Sign in required",
  ready: "Ready",
  "on-call": "On a call",
  unavailable: "Unavailable",
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function party(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return asString(o.phoneNumber) ?? asString(o.number);
}

declare global {
  interface Window {
    onZoomPhoneIframeApiReady?: (arg?: unknown) => void;
  }
}

export function ZoomPhoneProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // The dock starts open so the user can sign in to Zoom; once Zoom reports
  // the phone is ready it tucks itself away so it doesn't cover the page
  // (it re-opens by itself when a call starts, see makeCall).
  useEffect(() => {
    if (ready) setMinimized(true);
  }, [ready]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const seenIds = useRef(new Set<string>());
  // The call we are tracking: our own row id, the number we dialled, and the
  // Zoom call id once the first event reveals it.
  const tracked = useRef<{ callId: string | null; number: string; zoomCallId: string | null } | null>(null);
  const knownZoomIds = useRef(new Set<string>());
  const pendingDial = useRef<{ number: string; callerId: string | null } | null>(null);

  // Lazy mount: only once an agent opens /dial (or a call is started).
  const onDial = pathname?.startsWith("/dial") ?? false;
  useEffect(() => {
    if (onDial) setMounted(true);
  }, [onDial]);

  const post = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, ZOOM_ORIGIN);
  }, []);

  const sendInit = useCallback(() => {
    const config = {
      enableSavingLog: false,
      enableAutoLog: false,
      enableContactSearching: false,
      enableContactMatching: false,
      enableAISummary: true,
      disableInactiveTabCallEvent: true,
    };
    // Zoom's sample shows the fields beside `type`; its reference nests them
    // under `data`. Send both so either reading works.
    post({ type: "zp-init-config", ...config, data: config });
  }, [post]);

  const flushDial = useCallback(() => {
    const d = pendingDial.current;
    if (!d) return;
    pendingDial.current = null;
    const data = { number: d.number, ...(d.callerId ? { callerId: d.callerId } : {}), autoDial: true };
    post({ type: "zp-make-call", ...data, data });
  }, [post]);

  const readyRef = useRef(false);
  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
    sendInit();
  }, [sendInit]);

  // Zoom's documented readiness callback.
  useEffect(() => {
    if (!mounted) return;
    window.onZoomPhoneIframeApiReady = () => markReady();
    return () => {
      delete window.onZoomPhoneIframeApiReady;
    };
  }, [mounted, markReady]);

  useEffect(() => {
    if (!mounted || ready) return;
    const t = setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [mounted, ready]);

  useEffect(() => {
    if (ready) setTimedOut(false);
  }, [ready]);

  const forward = useCallback((payload: RecordZoomCallEventInput) => {
    void recordZoomCallEvent(payload).catch(() => {});
  }, []);

  useEffect(() => {
    if (!mounted) return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== ZOOM_ORIGIN) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as ZoomMessage | null;
      if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("zp-")) return;

      // Any message from the embed proves it loaded and is talking to us.
      markReady();
      flushDial();

      if (msg.id) {
        if (seenIds.current.has(msg.id)) return;
        seenIds.current.add(msg.id);
      }
      const d = (msg.data ?? {}) as Record<string, unknown>;
      const zoomCallId = asString(d.callId);
      if (!zoomCallId) return;
      const t = tracked.current;
      const direction: "inbound" | "outbound" | null = d.direction === "inbound" || d.direction === "outbound" ? d.direction : null;

      switch (msg.type) {
        case "zp-call-ringing-event":
        case "zp-call-connected-event":
        case "zp-call-ended-event": {
          if (!t || direction === "inbound") return;
          const callee = party(d.callee);
          // Bind this Zoom call id to the call we started (first event wins;
          // the server re-checks the number match).
          if (!t.zoomCallId) {
            const dialled = t.number.replace(/\D/g, "");
            const got = (callee ?? "").replace(/\D/g, "");
            if (!got || !(got === dialled || got.slice(-10) === dialled.slice(-10))) return;
            t.zoomCallId = zoomCallId;
          } else if (t.zoomCallId !== zoomCallId) {
            return;
          }
          knownZoomIds.current.add(zoomCallId);
          const base = { callId: t.callId, calleeNumber: callee, direction };
          if (msg.type === "zp-call-ringing-event") {
            setActiveCall((c) => (c && c.state !== "connected" && c.state !== "ended" ? { ...c, state: "ringing" } : c));
            forward({ ...base, event: { type: "ringing", zoomCallId } });
          } else if (msg.type === "zp-call-connected-event") {
            setActiveCall((c) => (c && c.state !== "ended" ? { ...c, state: "connected" } : c));
            forward({ ...base, event: { type: "connected", zoomCallId } });
          } else {
            const r = d.result;
            const result = r === "missed" || r === "rejected" || r === "ended" ? r : "ended";
            setActiveCall((c) => (c ? { ...c, state: "ended", result } : c));
            forward({ ...base, event: { type: "ended", zoomCallId, result } });
          }
          return;
        }
        case "zp-call-log-completed-event": {
          if (!knownZoomIds.current.has(zoomCallId)) return;
          const logId = asString(d.callLogId);
          if (!logId) return;
          const dur = typeof d.duration === "number" ? d.duration : Number(d.duration);
          forward({
            callId: t?.callId ?? null,
            calleeNumber: party(d.callee),
            direction: "outbound",
            event: {
              type: "log-completed",
              zoomCallId,
              zoomCallLogId: logId,
              durationSeconds: Number.isFinite(dur) ? dur : null,
            },
          });
          return;
        }
        case "zp-call-recording-completed-event": {
          const url = asString(d.recordingUrl);
          if (!knownZoomIds.current.has(zoomCallId) || !url) return;
          forward({
            callId: t?.callId ?? null,
            calleeNumber: null,
            direction: "outbound",
            event: { type: "recording-completed", zoomCallId, zoomCallLogId: asString(d.callLogId), recordingUrl: url },
          });
          return;
        }
        case "zp-ai-call-summary-event": {
          if (!knownZoomIds.current.has(zoomCallId) || d.deleted === true) return;
          forward({
            callId: t?.callId ?? null,
            calleeNumber: null,
            direction: "outbound",
            event: {
              type: "ai-summary",
              zoomCallId,
              summary: {
                callSummary: asString(d.callSummary),
                nextSteps: asString(d.nextSteps),
                detailedSummary: asString(d.detailedSummary),
              },
            },
          });
          return;
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mounted, markReady, flushDial, forward]);

  const makeCall = useCallback(
    (number: string, callId: string | null = null, callerId: string | null = null) => {
      tracked.current = { callId, number, zoomCallId: null };
      setActiveCall({ callId, number, state: "dialing", result: null });
      setMounted(true);
      setMinimized(false);
      pendingDial.current = { number, callerId };
      // If the iframe is already up, dial now; otherwise flushDial() runs
      // when it loads / first talks to us.
      if (iframeRef.current && loaded) flushDial();
      return true;
    },
    [loaded, flushDial],
  );

  const clearCall = useCallback(() => {
    tracked.current = null;
    pendingDial.current = null;
    setActiveCall(null);
  }, []);

  // Tell the page shell the dock is there, so it reserves room beside / below
  // the content instead of letting the panel sit on top of it (see globals.css).
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.zpDock = minimized ? "min" : "open";
    return () => {
      delete document.documentElement.dataset.zpDock;
    };
  }, [mounted, minimized]);

  const callLive = activeCall !== null && activeCall.state !== "ended";
  const status: PhoneStatus = !mounted
    ? "idle"
    : callLive
      ? "on-call"
      : ready
        ? "ready"
        : loaded
          ? "sign-in"
          : timedOut
            ? "unavailable"
            : "loading";

  const value = useMemo<PhoneApi>(
    () => ({ ready, status, setupHint: mounted && !ready && timedOut, activeCall, makeCall, clearCall }),
    [ready, status, mounted, timedOut, activeCall, makeCall, clearCall],
  );

  return (
    <PhoneContext.Provider value={value}>
      {children}
      {mounted && (
        <div
          className="fixed bottom-4 right-4 z-[55] w-[350px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
          data-testid="zoom-phone-dock"
        >
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            className="flex w-full items-center gap-2 bg-midnight-gradient px-3 py-2 text-left text-xs font-semibold text-white"
            aria-expanded={!minimized}
          >
            <Phone className="h-3.5 w-3.5" />
            Zoom Phone
            <span
              className={`ml-1 h-2 w-2 rounded-full ${status === "on-call" ? "bg-emerald-400" : ready ? "bg-emerald-400/70" : "bg-white/40"}`}
            />
            <span className="ml-auto text-white/70">{PHONE_LABEL[status]}</span>
            {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <iframe
            ref={iframeRef}
            id={IFRAME_ID}
            title="Zoom Phone"
            src={IFRAME_SRC}
            allow={`clipboard-read; clipboard-write ${ZOOM_ORIGIN}; microphone ${ZOOM_ORIGIN}`}
            onLoad={() => {
              setLoaded(true);
              sendInit();
              flushDial();
            }}
            className={minimized ? "h-0 w-full border-0" : "h-[580px] w-full border-0"}
          />
        </div>
      )}
    </PhoneContext.Provider>
  );
}
