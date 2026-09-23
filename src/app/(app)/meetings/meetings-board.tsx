"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Video,
  Copy,
  XCircle,
  PlayCircle,
  Clock,
  User,
  Sparkles,
  Film,
  Search,
  CalendarX2,
  Radio,
  ChevronDown,
} from "lucide-react";
import { setMeetingStatus, type ZoomMeetingRow } from "@/lib/actions/zoom";
import { MeetingRoom, useMeetingLauncher } from "@/components/zoom/meeting-room";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "live" | "past" | "cancelled";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live now" },
  { key: "past", label: "Past & recordings" },
  { key: "cancelled", label: "Cancelled" },
];

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

function leadName(m: ZoomMeetingRow) {
  return m.invitee_name ?? ([m.lead?.first_name, m.lead?.last_name].filter(Boolean).join(" ") || "Guest");
}

export function MeetingsBoard({
  meetings,
  hostName,
  currentUserId,
  readOnly,
  showHost,
}: {
  meetings: ZoomMeetingRow[];
  hostName: string;
  currentUserId: string;
  readOnly: boolean;
  showHost: boolean;
}) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { room, launch, close } = useMeetingLauncher();

  const buckets = useMemo(() => {
    const t = now ?? 0;
    const q = query.trim().toLowerCase();
    const match = (m: ZoomMeetingRow) =>
      !q || [m.topic, leadName(m), m.campaign?.code, m.host?.full_name].some((v) => v?.toLowerCase().includes(q));
    const all = meetings.filter(match);
    return {
      upcoming: all.filter((m) => m.status === "scheduled" && new Date(m.start_time).getTime() >= t - 10 * 60_000),
      live: all.filter((m) => m.status === "started"),
      past: all
        .filter((m) => m.status === "ended" || (m.status === "scheduled" && new Date(m.start_time).getTime() < t - 10 * 60_000))
        .sort((a, b) => b.start_time.localeCompare(a.start_time)),
      cancelled: all.filter((m) => m.status === "cancelled"),
    } satisfies Record<Tab, ZoomMeetingRow[]>;
  }, [meetings, query, now]);

  const next = buckets.upcoming[0];
  const list = buckets[tab];

  const grouped = useMemo(() => {
    const groups = new Map<string, ZoomMeetingRow[]>();
    for (const m of list) {
      const key = dayLabel(m.start_time);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    return [...groups.entries()];
  }, [list]);

  function start(m: ZoomMeetingRow) {
    launch({
      id: m.id,
      topic: m.topic,
      hostName: m.host?.full_name ?? hostName,
      inviteeName: leadName(m),
      joinUrl: m.join_url,
      startUrl: m.start_url,
      source: m.source,
    });
  }

  function cancel(m: ZoomMeetingRow) {
    startTransition(async () => {
      const r = await setMeetingStatus(m.id, "cancelled");
      if (r.error) toast.error(r.error);
      else {
        toast.success("Meeting cancelled");
        router.refresh();
      }
    });
  }

  async function copyInvite(m: ZoomMeetingRow) {
    await navigator.clipboard.writeText(
      `${m.topic}\n${new Date(m.start_time).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}\nJoin Zoom: ${m.join_url}\nPasscode: ${m.password ?? "—"}`,
    );
    toast.success("Invite copied to clipboard");
  }

  const canHost = (m: ZoomMeetingRow) => !readOnly && (m.host_id === currentUserId || showHost);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.key ? "text-white" : "text-muted hover:text-ink",
                )}
              >
                {tab === t.key && (
                  <motion.span layoutId="meeting-tab" className="absolute inset-0 rounded-lg bg-brand-gradient" transition={{ duration: 0.2 }} />
                )}
                <span className="relative">{t.label}</span>
                <span
                  className={cn(
                    "relative rounded-full px-1.5 text-[10px] tabular",
                    tab === t.key ? "bg-white/25" : "bg-canvas",
                  )}
                >
                  {buckets[t.key].length}
                </span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings…" className="pl-8" />
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {grouped.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <CalendarX2 className="h-8 w-8 text-muted" />
                  <div className="text-sm font-medium text-ink">Nothing here</div>
                  <div className="text-xs text-muted">
                    {tab === "upcoming" ? "Book a Zoom meeting from a lead or with the Schedule button." : "No meetings in this view yet."}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            grouped.map(([day, items]) => (
              <motion.div key={`${tab}-${day}`} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{day}</div>
                {items.map((m) => {
                  const startMs = new Date(m.start_time).getTime();
                  const soon = now !== null && m.status === "scheduled" && startMs - now < 15 * 60_000 && startMs - now > -10 * 60_000;
                  const isOpen = expanded === m.id;
                  return (
                    <motion.div key={m.id} layout>
                      <Card className={cn("group overflow-hidden transition-shadow hover:shadow-lg", soon && "ring-2 ring-gold/60")}>
                        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                          <div
                            className={cn(
                              "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center",
                              m.status === "started" ? "bg-brand-green-tint text-brand-green-text" : m.status === "cancelled" ? "bg-canvas text-muted" : "bg-[#eef3ff] text-[#0b5cff]",
                            )}
                          >
                            <span className="font-display text-base font-semibold tabular leading-none">
                              {new Date(m.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="mt-1 text-[10px]">{m.duration_minutes} min</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn("truncate text-sm font-semibold text-ink", m.status === "cancelled" && "line-through opacity-60")}>{m.topic}</span>
                              {m.campaign && <Badge variant="violet">{m.campaign.code}</Badge>}
                              {m.status === "started" && (
                                <Badge variant="confirm">
                                  <Radio className="h-3 w-3 animate-pulse-dot" /> Live
                                </Badge>
                              )}
                              {soon && <Badge variant="gold">Starts in {countdown(startMs - (now ?? 0))}</Badge>}
                              {m.recording_url && (
                                <Badge variant="zoom">
                                  <Film className="h-3 w-3" /> Recording
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" /> {leadName(m)}
                                {m.lead?.company_name ? ` · ${m.lead.company_name}` : ""}
                              </span>
                              {showHost && m.host && (
                                <span className="flex items-center gap-1">
                                  <Video className="h-3 w-3" /> Host {m.host.full_name}
                                </span>
                              )}
                              {m.actual_duration_minutes && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Ran {m.actual_duration_minutes} min · {m.participants ?? 2} people
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {(m.status === "scheduled" || m.status === "started") && canHost(m) && (
                              <Button size="sm" variant="zoom" onClick={() => start(m)}>
                                <PlayCircle className="h-4 w-4" /> {m.status === "started" ? "Rejoin" : "Start"}
                              </Button>
                            )}
                            {m.status !== "cancelled" && (
                              <Button size="sm" variant="secondary" onClick={() => copyInvite(m)} aria-label="Copy invite">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {m.status === "scheduled" && canHost(m) && (
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => cancel(m)} aria-label="Cancel meeting">
                                <XCircle className="h-4 w-4 text-danger" />
                              </Button>
                            )}
                            {(m.ai_summary || m.agenda) && (
                              <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : m.id)} aria-label="Details">
                                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                              </Button>
                            )}
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-line bg-canvas/60"
                            >
                              <div className="grid gap-3 p-3 text-sm sm:grid-cols-2">
                                {m.agenda && (
                                  <div>
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">Agenda</div>
                                    <p className="mt-1 text-ink">{m.agenda}</p>
                                  </div>
                                )}
                                {m.ai_summary && (
                                  <div className="rounded-lg bg-gold-tint p-2.5 ring-1 ring-gold/30">
                                    <div className="flex items-center gap-1 text-xs font-semibold text-gold-text">
                                      <Sparkles className="h-3.5 w-3.5" /> AI Companion summary
                                    </div>
                                    <p className="mt-1 text-ink">{m.ai_summary}</p>
                                  </div>
                                )}
                                {m.recording_url && (
                                  <a href={m.recording_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-[#0b5cff] hover:underline">
                                    <Film className="h-3.5 w-3.5" /> Open cloud recording
                                  </a>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Next up */}
      <div className="space-y-3">
        <Card className="relative overflow-hidden">
          <div className="bg-midnight-gradient p-4 text-white">
            <div className="text-xs font-semibold uppercase tracking-wide text-gold-soft">Next up</div>
            {next ? (
              <>
                <div className="mt-2 font-display text-lg font-semibold leading-snug">{next.topic}</div>
                <div className="mt-1 text-xs text-white/70">
                  {new Date(next.start_time).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} · with {leadName(next)}
                </div>
                <div className="mt-4 text-xs text-white/60">Starts in</div>
                <div className="shimmer-text font-display text-3xl font-semibold tabular">
                  {now === null ? "…" : countdown(new Date(next.start_time).getTime() - now)}
                </div>
                {canHost(next) && (
                  <Button variant="gold" className="mt-4 w-full" onClick={() => start(next)}>
                    <PlayCircle className="h-4 w-4" /> Start meeting
                  </Button>
                )}
              </>
            ) : (
              <div className="mt-2 text-sm text-white/70">No upcoming meetings.</div>
            )}
          </div>
        </Card>
        <Card>
          <CardContent className="space-y-2 py-4 text-xs text-muted">
            <div className="text-sm font-semibold text-ink">How it works</div>
            <p>1. On a call, press <span className="font-medium text-ink">Book Zoom</span> in the dial workspace.</p>
            <p>2. The meeting is created in Zoom, linked to the lead and added to your follow-up tray.</p>
            <p>3. After the meeting, the cloud recording and AI Companion summary appear here and on the lead.</p>
          </CardContent>
        </Card>
      </div>

      <AnimatePresence>
        {room && (
          <MeetingRoom
            meeting={room}
            onClose={() => {
              close();
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
