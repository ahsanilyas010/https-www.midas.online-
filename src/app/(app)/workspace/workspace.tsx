"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Phone,
  Mail,
  Clock,
  BookOpen,
  ChevronDown,
  Ban,
  Loader2,
  Inbox,
  History,
  Video,
  PhoneOff,
  PhoneCall,
  Sparkles,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ScheduleMeetingDialog } from "@/components/zoom/schedule-meeting-dialog";
import { Confetti } from "@/components/ui/confetti";
import { SimpleMarkdown } from "@/components/ui/simple-markdown";
import { useDialer, formatDuration } from "@/components/dialer/dialer-context";
import { cn } from "@/lib/utils";
import { priorContact } from "@/lib/leads/prior-contact";
import { LeadDetailsDialog } from "@/app/(app)/admin/campaigns/[id]/lead-details-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getNextLead,
  getQueueCounts,
  submitCallAttempt,
  type WorkspaceLead,
  type WorkspaceDisposition,
  type QueueCounts,
} from "@/lib/actions/workspace";

interface Campaign {
  id: string;
  code: string;
  name: string;
  market: string;
  max_attempts: number;
  script_md: string | null;
  objection_handling_md: string | null;
  opening_disclosure: string | null;
}

function useWrapTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}

const WIN_CODES = new Set(["connected_interested", "appointment_set", "interested_follow_up"]);

export function Workspace({
  agentName,
  agentTimezone,
  campaign,
  campaigns,
  initialLead,
  dispositions,
  initialCounts,
}: {
  agentName: string;
  agentTimezone: string;
  campaign: Campaign;
  campaigns: { id: string; code: string; name: string }[];
  initialLead: WorkspaceLead | null;
  dispositions: WorkspaceDisposition[];
  initialCounts: QueueCounts;
}) {
  const router = useRouter();
  const [celebrate, setCelebrate] = useState(0);
  const [savedToday, setSavedToday] = useState(0);
  const [lead, setLead] = useState(initialLead);
  const [counts, setCounts] = useState(initialCounts);
  const [dispositionId, setDispositionId] = useState("");
  const [notes, setNotes] = useState("");
  const [bookCallback, setBookCallback] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(true);
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const dispositionTriggerRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const selected = dispositions.find((d) => d.id === dispositionId);
  const wrapSeconds = useWrapTimer(touched);
  const dialer = useDialer();
  const leadCall = dialer.call.leadId && dialer.call.leadId === lead?.id ? dialer.call : null;
  const onLeadCall = leadCall && ["dialing", "ringing", "connected"].includes(leadCall.phase);

  // When a call to this lead ends, start wrap-up and jump to the disposition.
  useEffect(() => {
    const ended = dialer.call.lastEnded;
    if (!ended || !lead || ended.leadId !== lead.id) return;
    setTouched(true);
    setTimeout(() => dispositionTriggerRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialer.call.endedCount]);

  function resetPanel() {
    setDispositionId("");
    setNotes("");
    setBookCallback(false);
    setCallbackAt("");
    setTouched(false);
  }

  function advanceQueue() {
    startTransition(async () => {
      const [next, nextCounts] = await Promise.all([
        getNextLead(campaign.id),
        getQueueCounts(campaign.id),
      ]);
      setLead(next);
      setCounts(nextCounts);
    });
  }

  function handleSaveAndNext() {
    if (!lead) return;
    if (!selected) {
      toast.error("Select a disposition first.");
      dispositionTriggerRef.current?.focus();
      return;
    }
    if (selected.requires_note && !notes.trim()) {
      toast.error("This disposition requires a note.");
      notesRef.current?.focus();
      return;
    }
    if (bookCallback && !callbackAt) {
      toast.error("Set a date and time for the callback.");
      return;
    }

    startTransition(async () => {
      const result = await submitCallAttempt({
        leadId: lead.id,
        campaignId: campaign.id,
        dispositionCode: selected.code,
        notes,
        wrapSeconds,
        callbackAt: bookCallback && callbackAt ? new Date(callbackAt).toISOString() : null,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setSavedToday((n) => n + 1);
      if (WIN_CODES.has(selected.code)) {
        setCelebrate((n) => n + 1);
        toast.success(`${selected.label} — nice work!`, { icon: <Sparkles className="h-4 w-4 text-gold" /> });
      } else if (result.suppressed) {
        toast.success(`${lead.phone_e164} suppressed globally — written in the same transaction.`, {
          icon: <Ban className="h-4 w-4" />,
        });
      } else {
        toast.success(`Saved — ${selected.label}`);
      }

      if (result.warning) {
        toast.warning(result.warning, { duration: 8000 });
      }

      if (onLeadCall) dialer.hangUp();
      resetPanel();
      advanceQueue();
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(target.tagName);

      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveAndNext();
        return;
      }
      if (typing) return;
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispositionTriggerRef.current?.click();
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        notesRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispositionId, notes, bookCallback, callbackAt, lead]);

  return (
    <div className="flex h-full flex-col">
      <Confetti fire={celebrate} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          {campaigns.length > 1 ? (
            <Select value={campaign.id} onValueChange={(id) => router.push(`/workspace?campaign=${id}`)}>
              <SelectTrigger className="h-7 w-auto gap-2 border-brand-blue-tint-2 bg-brand-blue-tint px-2 text-xs font-semibold text-brand-blue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="blue">{campaign.code}</Badge>
          )}
          <span className="hidden sm:inline">{campaign.name}</span>
          <span className="hidden text-line sm:inline">|</span>
          <span className="hidden sm:inline">{agentName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular text-muted">
          {dialer.info.connected ? (
            <span className="hidden items-center gap-1.5 md:flex">
              <span
                className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
                style={{ background: dialer.info.providerColor }}
              >
                {dialer.info.providerInitials}
              </span>
              {dialer.info.providerName} · {dialer.info.callerId}
            </span>
          ) : (
            <span className="rounded-full bg-warning-tint px-2 py-0.5 font-medium text-warning">No dialer connected</span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-gold-tint px-2 py-0.5 font-medium text-gold-text">
            <Target className="h-3 w-3" /> {savedToday} logged this session
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Wrap {fmt(wrapSeconds)}
          </span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[200px_1fr] md:overflow-hidden xl:grid-cols-[200px_1fr_280px]">
        {/* Queue */}
        <div className="flex flex-col border-b border-line bg-surface p-3 md:border-b-0 md:border-r">
          <div className="mb-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[var(--brand-orange)] to-[var(--magenta)] px-3 py-2 text-white shadow-sm">
              <span className="font-medium">Due now</span>
              <span className="font-display text-lg font-semibold tabular">{counts.due_now}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[var(--brand-blue)] to-[var(--violet)] px-3 py-2 text-white shadow-sm">
              <span className="font-medium">Fresh</span>
              <span className="font-display text-lg font-semibold tabular">{counts.fresh}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-canvas px-3 py-1.5 text-muted">
              <span>Total dialable</span>
              <span className="tabular font-semibold text-ink">{counts.total}</span>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted">
            No lead browsing — the queue hands you the next lead to keep pacing honest.
            {pending && (
              <span className="mt-2 flex items-center gap-1 text-brand-blue">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
          </p>
        </div>

        {/* Lead */}
        <div className="flex flex-col overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {!lead ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full items-center justify-center"
              >
                <div className="text-center">
                  <Inbox className="mx-auto mb-2 h-6 w-6 text-muted" />
                  <p className="text-sm text-muted">Queue is empty. Nothing dialable right now.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.16 }}
                className="flex max-w-xl flex-col gap-4"
              >
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="font-display text-xl font-semibold text-ink">
                      {[lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                        lead.company_name ||
                        "Unnamed lead"}
                    </h2>
                    <Badge variant="neutral">
                      Attempt {lead.attempt_count + 1} of {campaign.max_attempts}
                    </Badge>
                    <LeadDetailsDialog
                      leadName={
                        [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                        lead.company_name ||
                        lead.phone_e164
                      }
                      custom={lead.custom as Record<string, unknown> | null}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${lead.phone_e164.replace(/\s+/g, "")}`}
                      className="tabular flex items-center gap-1.5 text-xl font-medium text-ink hover:text-brand-blue"
                    >
                      <Phone className="h-4 w-4" /> {lead.phone_e164}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        await navigator.clipboard.writeText(lead.phone_e164);
                        setCopied(true);
                        toast.success("Copied");
                        setTimeout(() => setCopied(false), 1200);
                      }}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-brand-green-text" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {lead.email && (
                    <div className="mt-1 flex items-center gap-2">
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1.5 text-sm text-muted hover:text-brand-blue"
                      >
                        <Mail className="h-3.5 w-3.5" /> {lead.email}
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          await navigator.clipboard.writeText(lead.email!);
                          setEmailCopied(true);
                          toast.success("Copied");
                          setTimeout(() => setEmailCopied(false), 1200);
                        }}
                      >
                        {emailCopied ? (
                          <Check className="h-3.5 w-3.5 text-brand-green-text" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!onLeadCall ? (
                    <Button
                      variant="confirm"
                      onClick={() =>
                        dialer.dial({
                          number: lead.phone_e164,
                          name: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.company_name,
                          leadId: lead.id,
                        })
                      }
                    >
                      <PhoneCall className="h-4 w-4" /> Call
                      {dialer.info.connected && dialer.info.providerName && (
                        <span className="rounded bg-black/10 px-1.5 text-[10px] font-medium">{dialer.info.providerName}</span>
                      )}
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={dialer.hangUp}>
                      <PhoneOff className="h-4 w-4" /> Hang up
                    </Button>
                  )}
                  <AnimatePresence>
                    {onLeadCall && leadCall && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                          leadCall.phase === "connected" ? "bg-brand-green-tint text-brand-green-text animate-ring" : "bg-warning-tint text-warning",
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", leadCall.phase === "connected" ? "bg-brand-green" : "bg-warning animate-pulse-dot")} />
                        {leadCall.phase === "connected" ? (
                          <span className="tabular">
                            {leadCall.onHold ? "On hold" : "Connected"} {formatDuration(leadCall.seconds)}
                          </span>
                        ) : leadCall.phase === "ringing" ? (
                          "Ringing…"
                        ) : (
                          `Dialling via ${dialer.info.providerName}…`
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                  <ScheduleMeetingDialog
                    hostName={agentName}
                    prefill={{
                      leadId: lead.id,
                      inviteeName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || undefined,
                      inviteeEmail: lead.email,
                      topic: `${campaign.code}: consultation with ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.company_name || "prospect"}`,
                    }}
                    trigger={
                      <Button variant="zoom">
                        <Video className="h-4 w-4" /> Book Zoom
                      </Button>
                    }
                  />
                  <ScheduleMeetingDialog
                    hostName={agentName}
                    defaultInstant
                    prefill={{
                      leadId: lead.id,
                      inviteeName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || undefined,
                      inviteeEmail: lead.email,
                      topic: `${campaign.code}: live call with ${[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "prospect"}`,
                    }}
                    trigger={
                      <Button variant="secondary">
                        <Video className="h-4 w-4 text-[#0b5cff]" /> Zoom now
                      </Button>
                    }
                  />
                </div>

                {(() => {
                  const { disposition, remarks } = priorContact(lead.custom);
                  if (!disposition && !remarks) return null;
                  return (
                    <div className="flex flex-col gap-1 rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
                      <div className="flex items-center gap-1.5 font-medium">
                        <History className="h-4 w-4" /> Worked before
                        {disposition && <Badge variant="warning">{disposition}</Badge>}
                      </div>
                      {remarks && <p className="text-xs leading-snug">{remarks}</p>}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2 rounded-md bg-brand-green-tint px-3 py-2 text-sm text-brand-green-text">
                  <Clock className="h-4 w-4" />
                  {lead.lead_local_time
                    ? `Lead's local time ${lead.lead_local_time.slice(0, 5)}`
                    : "Local time unavailable"}{" "}
                  · in calling window
                  <span className="ml-auto text-xs opacity-70">Your time zone: {agentTimezone}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm shadow-sm">
                  {lead.company_name && (
                    <>
                      <div className="text-muted">Company</div>
                      <div className="text-ink">
                        {lead.company_name}
                        {lead.job_title ? ` — ${lead.job_title}` : ""}
                      </div>
                    </>
                  )}
                  <div className="text-muted">Address</div>
                  <div className="text-ink">
                    {[lead.address_line1, lead.city, lead.region, lead.postcode].filter(Boolean).join(", ") ||
                      "—"}
                  </div>
                  <div className="text-muted">Screened</div>
                  <div className="flex items-center gap-1 text-brand-green-text">
                    <Check className="h-3.5 w-3.5" />
                    {lead.screened_at ? new Date(lead.screened_at).toLocaleDateString() : "—"}
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted">
                      Disposition <kbd className="rounded border border-line px-1 text-[10px]">D</kbd>
                    </label>
                    <Select
                      value={dispositionId}
                      onValueChange={(v) => {
                        setDispositionId(v);
                        setTouched(true);
                      }}
                    >
                      <SelectTrigger ref={dispositionTriggerRef}>
                        <SelectValue placeholder="Select outcome…" />
                      </SelectTrigger>
                      <SelectContent>
                        {dispositions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted">
                      Notes <kbd className="rounded border border-line px-1 text-[10px]">N</kbd>
                      {selected?.requires_note && <span className="text-danger"> · required</span>}
                    </label>
                    <Textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setTouched(true);
                      }}
                      rows={2}
                    />
                  </div>

                  <AnimatePresence>
                    {selected?.requires_followup && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-col gap-2 overflow-hidden"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={bookCallback}
                            onCheckedChange={(v) => setBookCallback(v === true)}
                          />
                          Book callback
                        </label>
                        <AnimatePresence>
                          {bookCallback && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden pl-6"
                            >
                              <Input
                                type="datetime-local"
                                value={callbackAt}
                                onChange={(e) => setCallbackAt(e.target.value)}
                                className="w-56"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleSaveAndNext}
                    disabled={pending}
                    className="mt-1 w-full"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Save &amp; next{" "}
                        <kbd className="ml-1.5 rounded bg-black/10 px-1.5 text-[10px]">Ctrl+Enter</kbd>
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Script */}
        <div className="hidden flex-col border-l border-line bg-surface xl:flex">
          <button
            onClick={() => setScriptOpen((o) => !o)}
            className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-medium text-muted hover:bg-canvas cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Script
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !scriptOpen && "-rotate-90")} />
          </button>
          <AnimatePresence initial={false}>
            {scriptOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 p-3 text-xs">
                  {campaign.opening_disclosure ? (
                    <div>
                      <div className="mb-1 font-semibold text-danger">Opening disclosure (must read)</div>
                      <p className="whitespace-pre-wrap text-muted">{campaign.opening_disclosure}</p>
                    </div>
                  ) : (
                    <div className="rounded-md bg-warning-tint px-2 py-1.5 text-warning">
                      No opening disclosure configured for this campaign yet.
                    </div>
                  )}
                  {campaign.script_md && (
                    <div>
                      <div className="mb-1 font-semibold text-ink">Talk track</div>
                      <SimpleMarkdown source={campaign.script_md} className="text-muted" />
                    </div>
                  )}
                  {campaign.objection_handling_md && (
                    <div>
                      <div className="mb-1 font-semibold text-ink">Objections</div>
                      <SimpleMarkdown source={campaign.objection_handling_md} className="text-muted" />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
