"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Video, Copy, Check, CalendarPlus, ExternalLink, Sparkles } from "lucide-react";
import { scheduleZoomMeeting, type ScheduleResult } from "@/lib/actions/zoom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { MeetingRoom, useMeetingLauncher } from "@/components/zoom/meeting-room";

export interface MeetingPrefill {
  leadId?: string;
  inviteeName?: string;
  inviteeEmail?: string | null;
  topic?: string;
  timezone?: string;
}

const DURATIONS = ["15", "20", "30", "45", "60"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Next quarter hour, at least 30 minutes out, in the browser's local time.
function defaultSlot() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function icsFor(topic: string, startIso: string, minutes: number, url: string) {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(startIso).getTime();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DialDesk//Zoom//EN",
    "BEGIN:VEVENT",
    `UID:${start}-${Math.random().toString(36).slice(2)}@dialdesk.demo`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(start + minutes * 60_000)}`,
    `SUMMARY:${topic.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:Join Zoom meeting: ${url}`,
    `LOCATION:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function SubmitButton({ instant }: { instant: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="zoom" disabled={pending} className="min-w-40">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
      {instant ? "Start meeting now" : "Schedule Zoom meeting"}
    </Button>
  );
}

export function ScheduleMeetingDialog({
  prefill,
  trigger,
  defaultInstant = false,
  hostName = "You",
  onScheduled,
}: {
  prefill?: MeetingPrefill;
  trigger?: React.ReactNode;
  defaultInstant?: boolean;
  hostName?: string;
  onScheduled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { room, launch, close } = useMeetingLauncher();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          // Fresh form (and cleared result) next time it opens.
          if (!v) setFormKey((k) => k + 1);
        }}
      >
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="zoom">
              <Video className="h-4 w-4" /> New Zoom meeting
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <ScheduleBody
            key={formKey}
            prefill={prefill}
            defaultInstant={defaultInstant}
            onClose={() => {
              setOpen(false);
              setFormKey((k) => k + 1);
            }}
            onScheduled={onScheduled}
            onLaunch={(m) => {
              setOpen(false);
              setFormKey((k) => k + 1);
              launch({ ...m, hostName });
            }}
          />
        </DialogContent>
      </Dialog>
      <AnimatePresence>{room && <MeetingRoom meeting={room} onClose={close} />}</AnimatePresence>
    </>
  );
}

type LaunchInfo = { id: string; topic: string; inviteeName: string | null; joinUrl: string; startUrl: string; source: string };

function ScheduleBody({
  prefill,
  defaultInstant,
  onClose,
  onScheduled,
  onLaunch,
}: {
  prefill?: MeetingPrefill;
  defaultInstant: boolean;
  onClose: () => void;
  onScheduled?: () => void;
  onLaunch: (m: LaunchInfo) => void;
}) {
  const [instant, setInstant] = useState(defaultInstant);
  const [copied, setCopied] = useState(false);
  const [state, formAction] = useActionState(scheduleZoomMeeting, {} as ScheduleResult);
  const router = useRouter();
  const slot = useMemo(defaultSlot, []);
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok && state.meeting) {
      toast.success(instant ? "Zoom meeting started" : "Zoom meeting scheduled", { icon: <Video className="h-4 w-4" /> });
      router.refresh();
      onScheduled?.();
      if (instant) onLaunch(state.meeting);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const done = state.ok && state.meeting && !instant;
  const invite = done
    ? `You're invited to a Zoom meeting.\n\n${state.meeting!.topic}\n${new Date(state.meeting!.startTime).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}\n\nJoin: ${state.meeting!.joinUrl}\nPasscode: ${state.meeting!.password ?? "—"}`
    : "";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b5cff] text-white">
            <Video className="h-4 w-4" />
          </span>
          {done ? "Meeting ready" : prefill?.inviteeName ? `Zoom with ${prefill.inviteeName}` : "New Zoom meeting"}
        </DialogTitle>
        <DialogDescription>
          {done
            ? "Share the invite, add it to your calendar, or start it straight away."
            : "Creates the meeting in Zoom, links it to the lead and adds it to your follow-ups."}
        </DialogDescription>
      </DialogHeader>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-[#0b5cff]/20 bg-[#f3f7ff] p-4">
              <Sparkles className="absolute right-3 top-3 h-5 w-5 text-gold" />
              <div className="text-sm font-semibold text-ink">{state.meeting!.topic}</div>
              <div className="mt-0.5 text-xs text-muted">
                {new Date(state.meeting!.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </div>
              <div className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-[#0b5cff] ring-1 ring-[#0b5cff]/15">
                {state.meeting!.joinUrl}
              </div>
              {state.meeting!.password && (
                <div className="mt-1.5 text-xs text-muted">
                  Passcode <span className="tabular font-medium text-ink">{state.meeting!.password}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(invite);
                  setCopied(true);
                  toast.success("Invite copied");
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4 text-brand-green-text" /> : <Copy className="h-4 w-4" />} Copy invite
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([icsFor(state.meeting!.topic, state.meeting!.startTime, state.meeting!.durationMinutes, state.meeting!.joinUrl)], { type: "text/calendar" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "zoom-meeting.ics";
                  a.click();
                }}
              >
                <CalendarPlus className="h-4 w-4" /> Add to calendar
              </Button>
              <Button variant="zoom" onClick={() => onLaunch(state.meeting!)}>
                <ExternalLink className="h-4 w-4" /> Start now
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.form key="form" action={formAction} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <input type="hidden" name="lead_id" value={prefill?.leadId ?? ""} />
            <input type="hidden" name="tz_offset" value={tzOffset} />
            <input type="hidden" name="instant" value={instant ? "1" : "0"} />

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1 text-sm">
              {[
                { v: false, label: "Schedule for later" },
                { v: true, label: "Instant meeting" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setInstant(o.v)}
                  className={`relative cursor-pointer rounded-lg px-3 py-1.5 font-medium transition-colors ${instant === o.v ? "text-white" : "text-muted hover:text-ink"}`}
                >
                  {instant === o.v && (
                    <motion.span layoutId="zoom-mode" className="absolute inset-0 rounded-lg bg-[#0b5cff]" transition={{ duration: 0.2 }} />
                  )}
                  <span className="relative">{o.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input id="topic" name="topic" required defaultValue={prefill?.topic ?? (prefill?.inviteeName ? `Consultation with ${prefill.inviteeName}` : "")} />
            </div>

            <AnimatePresence initial={false}>
              {!instant && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-3 gap-3 overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" name="date" type="date" defaultValue={slot.date} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="time">Time</Label>
                    <Input id="time" name="time" type="time" step={300} defaultValue={slot.time} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration</Label>
                    <Select name="duration" defaultValue="30">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invitee_name">Invitee name</Label>
                <Input id="invitee_name" name="invitee_name" defaultValue={prefill?.inviteeName ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invitee_email">Invitee email</Label>
                <Input id="invitee_email" name="invitee_email" type="email" defaultValue={prefill?.inviteeEmail ?? ""} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agenda">Agenda</Label>
              <Textarea id="agenda" name="agenda" rows={2} placeholder="What will you cover?" />
            </div>

            <input type="hidden" name="timezone" value={prefill?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} />

            {prefill?.leadId && !instant && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <Checkbox name="add_followup" defaultChecked /> Add to my follow-up tray with a reminder
              </label>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-muted">Cloud recording and waiting room follow your Zoom settings.</span>
              <SubmitButton instant={instant} />
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </>
  );
}
