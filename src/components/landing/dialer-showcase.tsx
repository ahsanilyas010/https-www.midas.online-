"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, PhoneOff, Mic, Pause, Circle, Check } from "lucide-react";
import { DIALER_PROVIDERS, CAPABILITY_LABEL } from "@/lib/telephony/providers";
import { cn } from "@/lib/utils";

type Phase = "idle" | "ringing" | "connected";

// Interactive landing-page demo: pick a dialer provider and watch the same
// softphone place a call through it.
export function DialerShowcase() {
  const [key, setKey] = useState(DIALER_PROVIDERS[0].key);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const p = DIALER_PROVIDERS.find((x) => x.key === key)!;

  useEffect(() => {
    if (phase === "ringing") {
      const t = setTimeout(() => setPhase("connected"), 1800);
      return () => clearTimeout(t);
    }
    if (phase === "connected") {
      setSeconds(0);
      const id = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(id);
    }
  }, [phase]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIALER_PROVIDERS.map((x) => (
            <button
              key={x.key}
              onClick={() => {
                setKey(x.key);
                setPhase("idle");
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all",
                key === x.key ? "border-transparent bg-white shadow-lg ring-2 ring-[var(--gold)]" : "border-white/15 bg-white/5 text-white hover:bg-white/10",
              )}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-[10px] font-bold text-white"
                style={{ background: x.color }}
              >
                {x.initials}
              </span>
              <span className={cn("truncate font-medium", key === x.key ? "text-ink" : "text-white")}>{x.name}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={p.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10"
          >
            <div className="text-sm font-semibold text-white">{p.name}</div>
            <p className="mt-1 text-sm text-white/70">{p.integrationNote}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.capabilities.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/85">
                  <Check className="h-3 w-3 text-gold-soft" /> {CAPABILITY_LABEL[c]}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Softphone mock */}
      <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2.5 bg-midnight-gradient px-4 py-3 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg font-display text-[10px] font-bold" style={{ background: p.color }}>
            {p.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{p.name}</div>
            <div className="text-[11px] text-white/60">Caller ID +44 20 3807 6512</div>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-7">
          <motion.span
            animate={phase === "ringing" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.9, repeat: phase === "ringing" ? Infinity : 0 }}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient font-display text-2xl font-semibold text-white shadow-lg",
              phase === "connected" && "animate-ring",
            )}
          >
            HH
          </motion.span>
          <div className="text-center">
            <div className="font-display text-lg font-semibold text-ink">Hannah Harris</div>
            <div className="text-xs text-muted">Roof Health Check · +44 7957 606555</div>
            <div
              className={cn(
                "mt-1 text-sm tabular",
                phase === "connected" ? "text-brand-green-text" : phase === "ringing" ? "text-warning" : "text-muted",
              )}
            >
              {phase === "idle" ? "Ready to call" : phase === "ringing" ? `Ringing via ${p.name}…` : `${mm}:${ss}`}
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              { icon: Mic, label: "Mute" },
              { icon: Pause, label: "Hold" },
              { icon: Circle, label: "Record" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl bg-canvas py-2.5 text-[11px] font-medium text-ink",
                  phase !== "connected" && "opacity-40",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </div>
            ))}
          </div>
          {phase === "idle" ? (
            <button
              onClick={() => setPhase("ringing")}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-brand-green text-white shadow-lg shadow-brand-green/30 transition hover:scale-105"
              aria-label="Try a call"
            >
              <Phone className="h-6 w-6" />
            </button>
          ) : (
            <button
              onClick={() => setPhase("idle")}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition hover:scale-105"
              aria-label="Hang up"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          )}
          <p className="text-center text-[11px] text-muted">{phase === "idle" ? "Press call to try it" : "Same softphone, whichever provider you pick"}</p>
        </div>
      </div>
    </div>
  );
}
