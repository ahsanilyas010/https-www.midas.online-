"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Device, type Call } from "@twilio/voice-sdk";

export type DeviceStatus = "offline" | "connecting" | "ready" | "on-call" | "error";

export interface TwilioDeviceState {
  status: DeviceStatus;
  error: string | null;
  muted: boolean;
  toggleMute: () => void;
  hangUp: () => void;
}

// Registers the agent's browser as a Twilio Voice SDK Device using the
// per-workspace AccessToken (src/app/api/twilio/[workspaceId]/token).
// Agents never originate calls from here (no device.connect()) — every
// call is server-initiated (src/lib/actions/dialer-v2.ts's placeCall()),
// which rings this Device as an incoming call; this hook just answers it
// automatically, since from the agent's point of view they already
// "placed" the call by clicking Call on a lead.
//
// This is Phase 3's foundation only — mute/hold/DTMF/transfer controls
// and the full dial-workspace screen are Phase 4's DIAL WORKSPACE UI,
// built on top of the state this hook exposes.
export function useTwilioDevice(workspaceId: string | null, enabled: boolean): TwilioDeviceState {
  const [status, setStatus] = useState<DeviceStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    let cancelled = false;

    async function setup() {
      setStatus("connecting");
      try {
        const res = await fetch(`/api/twilio/${workspaceId}/token`);
        if (!res.ok) throw new Error("Twilio isn't connected for this workspace yet.");
        const { token } = (await res.json()) as { token: string };
        if (cancelled) return;

        const device = new Device(token, { logLevel: "error" });
        deviceRef.current = device;

        device.on("registered", () => !cancelled && setStatus("ready"));
        device.on("error", (e) => !cancelled && (setStatus("error"), setError(e.message)));
        device.on("incoming", (call) => {
          activeCallRef.current = call;
          call.accept();
          setStatus("on-call");
          call.on("disconnect", () => {
            activeCallRef.current = null;
            setStatus("ready");
            setMuted(false);
          });
        });

        await device.register();
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Could not set up the softphone.");
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [workspaceId, enabled]);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  const hangUp = useCallback(() => {
    activeCallRef.current?.disconnect();
  }, []);

  return { status, error, muted, toggleMute, hangUp };
}
