"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Grid3x3,
  Circle,
  PhoneForwarded,
  Delete,
  X,
  History,
  PhoneIncoming,
  PhoneMissed,
  Loader2,
  PlugZap,
  Code2,
} from "lucide-react";
import { listRecentCalls, type RecentCall } from "@/lib/actions/dialer";
import { cn } from "@/lib/utils";
import { formatDuration, useDialer } from "./dialer-context";

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

function initials(s: string) {
  return (
    s
      .split(/\s+/)
      .map((p) => p[0])
      .filter((c) => c && /[A-Za-z]/.test(c))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "#"
  );
}

function ProviderBadge({ color, initials: ini, size = 28 }: { color: string; initials: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg font-display text-[11px] font-bold text-white shadow-sm"
      style={{ background: color, width: size, height: size }}
    >
      {ini}
    </span>
  );
}

// Global softphone: a floating phone button that opens a dialer panel.
// Every call goes through the client's connected dialer provider.
export function Softphone() {
  const { info, call, panelOpen, setPanelOpen, dial, hangUp, toggleMute, toggleHold, toggleRecording } = useDialer();
  const [tab, setTab] = useState<"keypad" | "recent">("keypad");
  const [number, setNumber] = useState("");
  const [dtmf, setDtmf] = useState(false);
  const [recent, setRecent] = useState<RecentCall[] | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [loading, startLoading] = useTransition();

  const inCall = call.phase === "dialing" || call.phase === "ringing" || call.phase === "connected";

  useEffect(() => {
    if (panelOpen && tab === "recent") {
      startLoading(async () => setRecent(await listRecentCalls(30)));
    }
  }, [panelOpen, tab, call.endedCount]);

  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) && !target.dataset.softphone) return;
      if (/^[0-9*#+]$/.test(e.key) && !inCall) setNumber((n) => (n + e.key).slice(0, 18));
      if (e.key === "Backspace" && !inCall && !target.dataset.softphone) setNumber((n) => n.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, inCall]);

  if (!info.enabled) return null;

  const statusText =
    call.phase === "dialing"
      ? `Connecting via ${info.providerName}…`
      : call.phase === "ringing"
        ? "Ringing…"
        : call.phase === "connected"
          ? call.onHold
            ? `On hold · ${formatDuration(call.seconds)}`
            : formatDuration(call.seconds)
          : call.phase === "ended"
            ? call.lastEnded?.connected
              ? `Call ended · ${formatDuration(call.lastEnded.seconds)} · logged`
              : "No answer · logged"
            : "";

  return (
    <>
      {/* Floating button */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setPanelOpen(!panelOpen)}
        className={cn(
          "fixed bottom-5 right-5 z-[55] flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-white shadow-xl",
          inCall ? "bg-brand-green animate-ring" : "bg-brand-gradient shadow-violet/40",
        )}
        aria-label={panelOpen ? "Close dialer" : "Open dialer"}
      >
        {panelOpen ? <X className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
        {inCall && !panelOpen && (
          <span className="absolute -top-1 -right-1 rounded-full bg-white px-1.5 text-[10px] font-semibold tabular text-brand-green-text shadow">
            {call.phase === "connected" ? formatDuration(call.seconds) : "…"}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-3 z-[55] flex max-h-[calc(100vh-7.5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-violet/25 sm:right-5"
            role="dialog"
            aria-label="Dialer"
          >
            {/* Header */}
            <div className="bg-midnight-gradient px-4 py-3 text-white">
              <div className="flex items-center gap-2.5">
                <ProviderBadge color={info.providerColor} initials={info.providerInitials} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{info.connected ? info.providerName : "No dialer connected"}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/65">
                    <span className={cn("h-1.5 w-1.5 rounded-full", info.connected ? "bg-emerald-400" : "bg-white/40")} />
                    {info.connected ? `Caller ID ${call.from ?? info.callerId ?? "—"}` : "Calls can't be placed yet"}
                  </div>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold-soft">Demo</span>
              </div>
            </div>

            {!info.connected ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <PlugZap className="h-8 w-8 text-muted" />
                <p className="text-sm text-ink">Connect the dialer your team subscribes to, such as Zoom Phone, Dialpad, Aircall or RingCentral.</p>
                {info.canManage ? (
                  <Link
                    href="/admin/integrations"
                    onClick={() => setPanelOpen(false)}
                    className="rounded-lg bg-brand-gradient px-3 py-2 text-sm font-medium text-white"
                  >
                    Connect a dialer
                  </Link>
                ) : (
                  <p className="text-xs text-muted">Ask an admin to connect one under Integrations.</p>
                )}
              </div>
            ) : inCall || call.phase === "ended" ? (
              /* In-call view */
              <div className="flex flex-col items-center gap-3 px-5 pb-5 pt-6">
                <motion.span
                  animate={call.phase === "ringing" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1, repeat: call.phase === "ringing" ? Infinity : 0 }}
                  className={cn(
                    "flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient font-display text-2xl font-semibold text-white shadow-lg",
                    call.phase === "connected" && !call.onHold && "animate-ring",
                  )}
                >
                  {initials(call.name ?? call.number)}
                </motion.span>
                <div className="text-center">
                  <div className="font-display text-lg font-semibold text-ink">{call.name ?? call.number}</div>
                  {call.name && <div className="tabular text-xs text-muted">{call.number}</div>}
                  <div
                    className={cn(
                      "mt-1 text-sm tabular",
                      call.phase === "connected" ? "text-brand-green-text" : call.phase === "ended" ? "text-muted" : "text-warning",
                    )}
                  >
                    {statusText}
                  </div>
                  {call.recording && call.phase === "connected" && (
                    <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-danger">
                      <Circle className="h-2 w-2 animate-pulse-dot fill-current" /> Recording
                    </div>
                  )}
                </div>

                {dtmf && call.phase === "connected" ? (
                  <div className="grid w-full grid-cols-3 gap-2">
                    {KEYS.map(([k]) => (
                      <button
                        key={k}
                        onClick={() => toast(`Sent tone ${k}`, { duration: 800 })}
                        className="h-11 cursor-pointer rounded-xl bg-canvas font-display text-lg text-ink hover:bg-brand-blue-tint"
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-3 gap-2 pt-1">
                    <CallControl label={call.muted ? "Unmute" : "Mute"} active={call.muted} disabled={call.phase !== "connected"} onClick={toggleMute}>
                      {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </CallControl>
                    <CallControl label={call.onHold ? "Resume" : "Hold"} active={call.onHold} disabled={call.phase !== "connected"} onClick={toggleHold}>
                      {call.onHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                    </CallControl>
                    <CallControl label="Keypad" disabled={call.phase !== "connected"} onClick={() => setDtmf(true)}>
                      <Grid3x3 className="h-5 w-5" />
                    </CallControl>
                    <CallControl label={call.recording ? "Stop rec" : "Record"} active={call.recording} disabled={call.phase !== "connected"} onClick={toggleRecording}>
                      <Circle className="h-5 w-5" />
                    </CallControl>
                    <CallControl
                      label="Transfer"
                      disabled={call.phase !== "connected"}
                      onClick={() => toast(`Transfer is handled by ${info.providerName} once connected live.`)}
                    >
                      <PhoneForwarded className="h-5 w-5" />
                    </CallControl>
                    <CallControl label="API" onClick={() => setShowRequest((v) => !v)} active={showRequest}>
                      <Code2 className="h-5 w-5" />
                    </CallControl>
                  </div>
                )}
                {dtmf && (
                  <button onClick={() => setDtmf(false)} className="cursor-pointer text-xs font-medium text-brand-blue">
                    Hide keypad
                  </button>
                )}

                <AnimatePresence>
                  {showRequest && call.request && (
                    <motion.pre
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="max-h-40 w-full overflow-auto whitespace-pre-wrap break-all rounded-xl bg-midnight p-3 text-[10px] leading-relaxed text-emerald-200"
                    >
                      {call.request.kind === "http"
                        ? `${call.request.method} ${call.request.url}\n${JSON.stringify(call.request.body, null, 2)}`
                        : `${call.request.url}\n\n${call.request.note}`}
                    </motion.pre>
                  )}
                </AnimatePresence>

                {call.phase !== "ended" && (
                  <button
                    onClick={hangUp}
                    className="mt-1 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition hover:brightness-110"
                    aria-label="Hang up"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex gap-1 border-b border-line px-3 pt-2">
                  {(["keypad", "recent"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "relative cursor-pointer px-3 pb-2 text-sm font-medium capitalize",
                        tab === t ? "text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {t === "recent" ? "Recent calls" : "Keypad"}
                      {tab === t && <motion.span layoutId="softphone-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-gradient" />}
                    </button>
                  ))}
                </div>

                {tab === "keypad" ? (
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-2 rounded-2xl bg-canvas px-3">
                      <input
                        data-softphone="1"
                        value={number}
                        onChange={(e) => setNumber(e.target.value.replace(/[^\d+*# ]/g, "").slice(0, 18))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && number) void dial({ number });
                        }}
                        placeholder="Enter a number"
                        className="h-12 flex-1 bg-transparent text-center font-display text-xl tabular text-ink outline-none placeholder:text-sm placeholder:text-muted"
                      />
                      {number && (
                        <button onClick={() => setNumber((n) => n.slice(0, -1))} className="cursor-pointer text-muted hover:text-ink" aria-label="Delete digit">
                          <Delete className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {KEYS.map(([k, letters]) => (
                        <motion.button
                          key={k}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setNumber((n) => (n + k).slice(0, 18))}
                          onContextMenu={(e) => {
                            if (k === "0") {
                              e.preventDefault();
                              setNumber((n) => (n + "+").slice(0, 18));
                            }
                          }}
                          className="flex h-14 cursor-pointer flex-col items-center justify-center rounded-2xl bg-canvas transition-colors hover:bg-brand-blue-tint"
                        >
                          <span className="font-display text-xl font-medium text-ink">{k}</span>
                          <span className="text-[9px] font-medium tracking-widest text-muted">{letters}</span>
                        </motion.button>
                      ))}
                    </div>
                    <button
                      disabled={!number}
                      onClick={() => dial({ number })}
                      className="mx-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-brand-green text-white shadow-lg shadow-brand-green/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Call"
                    >
                      <Phone className="h-6 w-6" />
                    </button>
                    <p className="text-center text-[11px] text-muted">
                      Calls go out through {info.providerName}. Try +44 7700 900 123.
                    </p>
                  </div>
                ) : (
                  <div className="min-h-64 flex-1 overflow-y-auto">
                    {loading && !recent ? (
                      <div className="flex h-40 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
                      </div>
                    ) : (recent ?? []).length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center gap-1 text-sm text-muted">
                        <History className="h-5 w-5" /> No calls yet
                      </div>
                    ) : (
                      (recent ?? []).map((r) => {
                        const name = r.lead ? [r.lead.first_name, r.lead.last_name].filter(Boolean).join(" ") || r.lead.company_name : null;
                        const missed = r.status === "missed" || r.status === "failed";
                        return (
                          <div key={r.id} className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-canvas/70">
                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", missed ? "bg-danger-tint text-danger" : "bg-brand-green-tint text-brand-green-text")}>
                              {missed ? <PhoneMissed className="h-4 w-4" /> : <PhoneIncoming className="h-4 w-4 rotate-180" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-ink">{name ?? r.to_number}</div>
                              <div className="truncate text-[11px] text-muted">
                                {new Date(r.started_at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                {" · "}
                                {missed ? "No answer" : formatDuration(r.duration_seconds)}
                                {r.agent ? ` · ${r.agent.full_name}` : ""}
                              </div>
                            </div>
                            <button
                              onClick={() => dial({ number: r.to_number, name, leadId: r.lead?.id ?? null })}
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-brand-green-text opacity-70 hover:bg-brand-green-tint group-hover:opacity-100"
                              aria-label="Call back"
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CallControl({
  children,
  label,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-brand-blue text-white" : "bg-canvas text-ink hover:bg-brand-blue-tint",
      )}
    >
      {children}
      {label}
    </button>
  );
}
