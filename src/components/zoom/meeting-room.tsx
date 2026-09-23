"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  MessageSquare,
  Circle,
  PhoneOff,
  Users,
  Sparkles,
  Shield,
  Minimize2,
} from "lucide-react";
import { setMeetingStatus } from "@/lib/actions/zoom";
import { cn } from "@/lib/utils";

export interface RoomMeeting {
  id: string;
  topic: string;
  hostName: string;
  inviteeName: string | null;
  joinUrl: string;
  startUrl: string;
  source: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const CAPTIONS = [
  "Thanks for making the time today.",
  "So the main thing we want to understand is your timeline.",
  "That makes sense. What budget range are you working with?",
  "Great. I'll send over a summary and the next steps after this call.",
  "Does Tuesday morning work for the follow-up?",
];

// A lifelike stand-in for the Zoom client — the demo build's "Start
// meeting" experience.
export function MeetingRoom({
  meeting,
  onClose,
}: {
  meeting: RoomMeeting;
  onClose: (ended: boolean) => void;
}) {
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [recording, setRecording] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speaker, setSpeaker] = useState(0);
  const [caption, setCaption] = useState(0);
  const [joined, setJoined] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setJoined(true), 1600);
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const talk = setInterval(() => setSpeaker((s) => (s + 1) % 2), 3200);
    const cap = setInterval(() => setCaption((c) => (c + 1) % CAPTIONS.length), 4200);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
      clearInterval(talk);
      clearInterval(cap);
    };
  }, []);

  const guest = meeting.inviteeName ?? "Guest";
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  function end() {
    startTransition(async () => {
      const result = await setMeetingStatus(meeting.id, "ended");
      if (result.error) toast.error(result.error);
      else toast.success("Meeting ended. Recording and AI summary saved.", { icon: <Sparkles className="h-4 w-4" /> });
      onClose(true);
    });
  }

  const tiles = [
    { name: meeting.hostName, you: true, gradient: "from-[var(--brand-blue)] to-[var(--violet)]" },
    { name: guest, you: false, gradient: "from-[var(--magenta)] to-[var(--gold)]" },
  ];

  if (!mounted) return null;
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-[#1a1a1a] text-white"
      role="dialog"
      aria-label="Zoom meeting"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <span className="font-medium">{meeting.topic}</span>
          {meeting.source === "demo" && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">Demo simulation</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {recording && (
            <span className="flex items-center gap-1 text-red-400">
              <Circle className="h-2.5 w-2.5 animate-pulse-dot fill-current" /> REC
            </span>
          )}
          <span className="tabular text-white/70">
            {mm}:{ss}
          </span>
          <button onClick={() => onClose(false)} className="cursor-pointer rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Minimise">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center p-4">
        <AnimatePresence>
          {!joined && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#1a1a1a]"
            >
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#0b5cff]" />
              <div className="text-sm text-white/70">Waiting for {guest} to join from the waiting room…</div>
            </motion.div>
          )}
        </AnimatePresence>

        {sharing ? (
          <div className="grid h-full w-full max-w-6xl grid-rows-[1fr_auto] gap-3">
            <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-[#262a3a] to-[#1d2030] ring-1 ring-white/10">
              <div className="text-center">
                <MonitorUp className="mx-auto h-10 w-10 text-[#4f8bff]" />
                <div className="mt-2 text-sm text-white/80">You are sharing your screen: Quote &amp; savings estimate</div>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              {tiles.map((t, i) => (
                <div key={t.name} className={cn("flex h-20 w-32 items-center justify-center rounded-lg bg-[#2b2b2b] ring-2", speaker === i ? "ring-emerald-400" : "ring-transparent")}>
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold", t.gradient)}>{initials(t.name)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid h-full w-full max-w-6xl gap-3 md:grid-cols-2">
            {tiles.map((t, i) => {
              const camOff = t.you && !camera;
              return (
                <div
                  key={t.name}
                  className={cn(
                    "relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-[#2b2b2b] ring-2 transition-all duration-300",
                    speaker === i && joined ? "ring-emerald-400" : "ring-transparent",
                  )}
                >
                  {!camOff && (
                    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-25", t.gradient)} aria-hidden />
                  )}
                  <motion.span
                    animate={speaker === i && joined ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                    transition={{ duration: 1.2, repeat: speaker === i ? Infinity : 0 }}
                    className={cn("relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-semibold shadow-2xl", t.gradient)}
                  >
                    {initials(t.name)}
                  </motion.span>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/50 px-2 py-0.5 text-xs">
                    {t.you && muted ? <MicOff className="h-3 w-3 text-red-400" /> : <Mic className="h-3 w-3" />}
                    {t.name}
                    {t.you && " (Host, me)"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {joined && (
          <div className="pointer-events-none absolute bottom-14 left-1/2 max-w-xl -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-center text-sm">
            <AnimatePresence mode="wait">
              <motion.span key={caption} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span className="mr-1 text-[#4f8bff]">{speaker === 0 ? meeting.hostName.split(" ")[0] : guest.split(" ")[0]}:</span>
                {CAPTIONS[caption]}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 bg-[#111] px-3 py-2">
        <div className="flex items-center gap-1">
          <Control label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)} danger={muted}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Control>
          <Control label={camera ? "Stop video" : "Start video"} onClick={() => setCamera((c) => !c)} danger={!camera}>
            {camera ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Control>
        </div>
        <div className="flex items-center gap-1">
          <Control label="Participants" onClick={() => toast(`${joined ? 2 : 1} participants in the meeting`)}>
            <Users className="h-5 w-5" />
          </Control>
          <Control label="Chat" onClick={() => toast("Chat: “Link to the quote is in the email.”")}>
            <MessageSquare className="h-5 w-5" />
          </Control>
          <Control label={sharing ? "Stop share" : "Share screen"} onClick={() => setSharing((s) => !s)} active={sharing}>
            <MonitorUp className="h-5 w-5" />
          </Control>
          <Control label={recording ? "Pause rec" : "Record"} onClick={() => setRecording((r) => !r)} active={recording}>
            <Circle className="h-5 w-5" />
          </Control>
          <Control label="AI Companion" onClick={() => toast("AI Companion is taking notes and will summarise this meeting.", { icon: <Sparkles className="h-4 w-4" /> })}>
            <Sparkles className="h-5 w-5 text-gold" />
          </Control>
        </div>
        <button
          onClick={end}
          disabled={pending}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
        >
          <PhoneOff className="h-4 w-4" /> End
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}

function Control({
  children,
  label,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-w-16 cursor-pointer flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] text-white/80 transition-colors hover:bg-white/10",
        danger && "text-red-400",
        active && "text-emerald-400",
      )}
    >
      {children}
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

/** Opens a meeting in the simulated Zoom room. */
export function useMeetingLauncher() {
  const [room, setRoom] = useState<RoomMeeting | null>(null);
  const [, startTransition] = useTransition();

  function launch(m: RoomMeeting) {
    startTransition(async () => {
      await setMeetingStatus(m.id, "started");
    });
    setRoom(m);
  }

  return { room, launch, close: () => setRoom(null) };
}
