"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startCall, updateCall } from "@/lib/actions/dialer";
import type { ProviderHttpRequest } from "@/lib/telephony/types";

export interface DialerInfo {
  enabled: boolean; // role can use the dialer
  connected: boolean;
  providerKey: string | null;
  providerName: string | null;
  providerColor: string;
  providerInitials: string;
  callerId: string | null;
  numbers: string[];
  recordCalls: boolean;
  canManage: boolean;
}

export type CallPhase = "idle" | "dialing" | "ringing" | "connected" | "ended";

export interface ActiveCall {
  phase: CallPhase;
  callId: string | null;
  number: string;
  name: string | null;
  leadId: string | null;
  from: string | null;
  seconds: number;
  muted: boolean;
  onHold: boolean;
  recording: boolean;
  request: ProviderHttpRequest | null;
  /** Increments every time a call finishes, so pages can react to it. */
  endedCount: number;
  lastEnded: { leadId: string | null; seconds: number; connected: boolean } | null;
}

interface DialerContextValue {
  info: DialerInfo;
  call: ActiveCall;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  dial: (target: { number: string; name?: string | null; leadId?: string | null }) => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  toggleRecording: () => void;
}

const IDLE: ActiveCall = {
  phase: "idle",
  callId: null,
  number: "",
  name: null,
  leadId: null,
  from: null,
  seconds: 0,
  muted: false,
  onHold: false,
  recording: false,
  request: null,
  endedCount: 0,
  lastEnded: null,
};

const Ctx = createContext<DialerContextValue | null>(null);

// Simulated call progress (demo). With a live provider, these transitions
// come from the provider's call-event webhooks instead of timers.
const RING_MS = 2600;

export function DialerProvider({ info, children }: { info: DialerInfo; children: React.ReactNode }) {
  const [call, setCall] = useState<ActiveCall>(IDLE);
  const [panelOpen, setPanelOpen] = useState(false);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    if (call.phase !== "connected" || call.onHold) return;
    const id = setInterval(() => setCall((c) => ({ ...c, seconds: c.seconds + 1 })), 1000);
    return () => clearInterval(id);
  }, [call.phase, call.onHold]);

  const dial = useCallback<DialerContextValue["dial"]>(
    async ({ number, name = null, leadId = null }) => {
      if (!info.connected) {
        toast.error("No dialer connected. An admin can connect one under Integrations.");
        setPanelOpen(true);
        return;
      }
      if (call.phase !== "idle" && call.phase !== "ended") {
        toast.error("You're already on a call.");
        return;
      }
      setPanelOpen(true);
      setCall((c) => ({ ...IDLE, endedCount: c.endedCount, lastEnded: c.lastEnded, phase: "dialing", number, name, leadId, recording: info.recordCalls }));
      const result = await startCall({ to: number, leadId });
      if (result.error || !result.callId) {
        toast.error(result.error ?? "Call failed.");
        setCall((c) => ({ ...c, phase: "idle" }));
        return;
      }
      // Agent hung up while the dialer was still placing the call.
      if (callRef.current.phase !== "dialing") {
        void updateCall(result.callId, "missed");
        return;
      }
      setCall((c) => ({ ...c, phase: "ringing", callId: result.callId!, from: result.from ?? null, request: result.request ?? null }));
      ringTimer.current = setTimeout(async () => {
        setCall((c) => (c.phase === "ringing" ? { ...c, phase: "connected" } : c));
        await updateCall(result.callId!, "connected");
      }, RING_MS);
    },
    [call.phase, info.connected, info.recordCalls],
  );

  const hangUp = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    const current = callRef.current;
    if (current.phase === "idle" || current.phase === "ended") return;
    const connected = current.phase === "connected";
    if (current.callId) void updateCall(current.callId, connected ? "completed" : "missed");
    setCall((c) => ({
      ...c,
      phase: "ended",
      endedCount: c.endedCount + 1,
      lastEnded: { leadId: c.leadId, seconds: c.seconds, connected },
    }));
  }, []);

  // Clear the "call ended" summary after a moment.
  useEffect(() => {
    if (call.phase !== "ended") return;
    const t = setTimeout(() => setCall((c) => (c.phase === "ended" ? { ...c, phase: "idle" } : c)), 2800);
    return () => clearTimeout(t);
  }, [call.phase]);

  const value: DialerContextValue = {
    info,
    call,
    panelOpen,
    setPanelOpen,
    dial,
    hangUp,
    toggleMute: () => setCall((c) => ({ ...c, muted: !c.muted })),
    toggleHold: () => setCall((c) => ({ ...c, onHold: !c.onHold })),
    toggleRecording: () => setCall((c) => ({ ...c, recording: !c.recording })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDialer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDialer must be used inside <DialerProvider>");
  return v;
}

export function formatDuration(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
