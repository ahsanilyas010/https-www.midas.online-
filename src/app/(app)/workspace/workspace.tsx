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
} from "lucide-react";
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

export function Workspace({
  agentName,
  agentTimezone,
  campaign,
  initialLead,
  dispositions,
  initialCounts,
}: {
  agentName: string;
  agentTimezone: string;
  campaign: Campaign;
  initialLead: WorkspaceLead | null;
  dispositions: WorkspaceDisposition[];
  initialCounts: QueueCounts;
}) {
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

      if (result.suppressed) {
        toast.success(`${lead.phone_e164} suppressed globally — written in the same transaction.`, {
          icon: <Ban className="h-4 w-4" />,
        });
      } else {
        toast.success(`Saved — ${selected.label}`);
      }

      if (result.warning) {
        toast.warning(result.warning, { duration: 8000 });
      }

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
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge variant="blue">{campaign.code}</Badge>
          <span>{agentName}</span>
        </div>
        <span className="flex items-center gap-1 text-[11px] tabular text-muted">
          <Clock className="h-3 w-3" /> Wrap {fmt(wrapSeconds)}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-[200px_1fr_260px] overflow-hidden">
        {/* Queue */}
        <div className="flex flex-col border-r border-line bg-white p-3">
          <div className="mb-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between rounded-md bg-brand-orange-tint px-2 py-1.5">
              <span className="font-medium text-brand-orange-text">Due now</span>
              <span className="tabular font-semibold text-brand-orange-text">{counts.due_now}</span>
            </div>
            <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted">
              <span>Fresh</span>
              <span className="tabular">{counts.fresh}</span>
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
                    <h2 className="text-lg font-semibold text-ink">
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
                    ? `Local time ${new Date(lead.lead_local_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Local time unavailable"}{" "}
                  · in calling window
                  <span className="ml-auto text-xs opacity-70">Your time zone: {agentTimezone}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border border-line bg-white p-3 text-sm">
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

                <div className="flex flex-col gap-3 rounded-md border border-line bg-white p-3">
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
                    variant="accent"
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
        <div className="flex flex-col border-l border-line bg-white">
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
                      <p className="whitespace-pre-wrap text-muted">{campaign.script_md}</p>
                    </div>
                  )}
                  {campaign.objection_handling_md && (
                    <div>
                      <div className="mb-1 font-semibold text-ink">Objections</div>
                      <p className="whitespace-pre-wrap text-muted">{campaign.objection_handling_md}</p>
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
