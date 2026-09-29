"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, ChevronDown, Clock, AlertTriangle } from "lucide-react";
import {
  pullNextLead,
  submitDisposition,
  snoozeCallback,
  type DialWorkspaceLead,
} from "@/lib/actions/dial-workspace";
import { placeCall } from "@/lib/actions/dialer-v2";
import { useTwilioDevice } from "@/components/dialer-v2/use-twilio-device";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RealTables } from "@/lib/supabase/real-types";

type Disposition = RealTables<"dispositions">;
type Callback = RealTables<"callbacks">;

export function DialWorkspaceClient({
  workspaceId,
  dispositions,
  initialDueCallbacks,
}: {
  workspaceId: string;
  dispositions: Disposition[];
  initialDueCallbacks: Callback[];
}) {
  const [current, setCurrent] = useState<DialWorkspaceLead | null | undefined>(undefined);
  const [pulling, startPull] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [callbackDueAt, setCallbackDueAt] = useState("");
  const [dueCallbacks, setDueCallbacks] = useState(initialDueCallbacks);
  const [calling, setCalling] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const dispositionRef = useRef<HTMLDivElement>(null);

  const device = useTwilioDevice(workspaceId, Boolean(current));

  const pull = useCallback(() => {
    setError(null);
    startPull(async () => {
      const res = await pullNextLead();
      if (res.error) {
        setError(res.error);
        setCurrent(null);
        return;
      }
      setCurrent(res.lead ?? null);
      setNotes("");
      setSelectedCode(null);
      setCallbackDueAt("");
      setCalling(false);
    });
  }, []);

  useEffect(() => {
    pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDisposition = dispositions.find((d) => d.code === selectedCode) ?? null;

  const submit = useCallback(() => {
    if (!current || !selectedCode) {
      setError("Pick an outcome before saving.");
      return;
    }
    if (selectedDisposition?.requires_note && notes.trim().length === 0) {
      setError("This outcome requires a note.");
      return;
    }
    setError(null);
    startSubmit(async () => {
      const res = await submitDisposition({
        leadId: current.lead.id,
        dispositionCode: selectedCode,
        notes: notes.trim() || undefined,
        callbackDueAt: callbackDueAt ? new Date(callbackDueAt).toISOString() : undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      pull();
    });
  }, [current, selectedCode, notes, callbackDueAt, selectedDisposition, pull]);

  // Keyboard shortcuts: D opens/focuses the disposition picker, N focuses
  // notes, Ctrl+Enter saves and loads the next lead (spec).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      } else if (!typing && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispositionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (!typing && e.key.toLowerCase() === "n") {
        e.preventDefault();
        notesRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submit]);

  async function handleCall() {
    if (!current) return;
    setCalling(true);
    setError(null);
    const res = await placeCall(current.lead.id);
    if (res.error) {
      setError(res.error);
      setCalling(false);
    }
  }

  async function handleSnooze(callbackId: string) {
    const res = await snoozeCallback(callbackId);
    setDueCallbacks((prev) => prev.filter((c) => c.id !== callbackId));
    if (res.error) setError(res.error);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Dial workspace</h1>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span
            className={`h-2 w-2 rounded-full ${device.status === "ready" || device.status === "on-call" ? "bg-brand-green" : device.status === "error" ? "bg-danger" : "bg-line"}`}
          />
          Softphone: {device.status}
        </div>
      </div>

      {dueCallbacks.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold-tint p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gold-text">
            <Clock className="h-4 w-4" /> Due now: {dueCallbacks.length} callback{dueCallbacks.length === 1 ? "" : "s"}
          </div>
          {dueCallbacks.map((cb) => (
            <div key={cb.id} className="flex items-center justify-between text-xs text-ink">
              <span>Due {new Date(cb.due_at).toLocaleTimeString()}</span>
              <button onClick={() => handleSnooze(cb.id)} className="font-medium text-brand-blue hover:underline">
                Snooze 15m {cb.snooze_count >= 2 ? "(last chance — then escalates)" : ""}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-tint px-4 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {current === undefined || pulling ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">Loading your next lead...</CardContent>
        </Card>
      ) : current === null ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No dialable leads right now — check back once new leads are uploaded or screened.
          </CardContent>
        </Card>
      ) : (
        <>
          {current.campaign?.disclosure_script && (
            <Card className="border-brand-blue/30 bg-brand-blue-tint/40">
              <CardHeader>
                <CardTitle>Opening disclosure</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-ink">{current.campaign.disclosure_script}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{current.lead.full_name ?? "Unknown name"}</CardTitle>
              <span className="text-xs text-muted">
                Attempt {current.lead.attempts + 1}
                {current.campaign ? ` of ${current.campaign.max_attempts}` : ""}
              </span>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="font-mono text-lg text-ink">{current.lead.phone_e164}</span>
              {device.status === "on-call" ? (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="icon" onClick={device.toggleMute} aria-label={device.muted ? "Unmute" : "Mute"}>
                    {device.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button variant="danger" onClick={device.hangUp}>
                    <PhoneOff className="h-4 w-4" /> Hang up
                  </Button>
                </div>
              ) : (
                <Button onClick={handleCall} disabled={calling}>
                  <PhoneCall className="h-4 w-4" /> {calling ? "Calling..." : "Call"}
                </Button>
              )}
            </CardContent>
          </Card>

          {current.campaign?.objection_notes && (
            <details className="rounded-xl border border-line bg-white">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-ink">
                Objection handling <ChevronDown className="h-4 w-4" />
              </summary>
              <div className="whitespace-pre-wrap border-t border-line px-4 py-3 text-sm text-muted">{current.campaign.objection_notes}</div>
            </details>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notes {selectedDisposition?.requires_note && <span className="text-danger">(required)</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened on this call? (press N to focus)" />
            </CardContent>
          </Card>

          <Card ref={dispositionRef}>
            <CardHeader>
              <CardTitle>Outcome (press D to jump here)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {dispositions.map((d) => (
                <button
                  key={d.code}
                  onClick={() => setSelectedCode(d.code)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    selectedCode === d.code
                      ? "border-brand-blue bg-brand-blue-tint text-brand-blue"
                      : "border-line bg-white text-ink hover:border-brand-blue-tint-2"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </CardContent>
            {selectedDisposition?.requires_followup && (
              <CardContent className="border-t border-line pt-3">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                  Callback due
                  <input
                    type="datetime-local"
                    value={callbackDueAt}
                    onChange={(e) => setCallbackDueAt(e.target.value)}
                    className="h-9 rounded-md border border-line px-3 text-sm"
                  />
                </label>
              </CardContent>
            )}
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? "Saving..." : "Save & next (Ctrl+Enter)"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
