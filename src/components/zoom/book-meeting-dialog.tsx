"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2, Video } from "lucide-react";
import { scheduleMeeting } from "@/lib/actions/zoom-meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// datetime-local value (local time) for the next half hour.
function defaultStart(): string {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Contract: other screens (the dial screen, the call sheet) import this from this
// path as <BookMeetingDialog leadId={string} leadName={string | null} />.
export function BookMeetingDialog({ leadId, leadName }: { leadId: string; leadName: string | null }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("30");
  const [agenda, setAgenda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ joinUrl: string; password: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function show() {
    setTopic(leadName ? `Meeting with ${leadName}` : "Meeting");
    setStart(defaultStart());
    setDuration("30");
    setAgenda("");
    setError(null);
    setBooked(null);
    setCopied(false);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const when = new Date(start);
    if (Number.isNaN(when.getTime())) {
      setError("Pick a start date and time.");
      return;
    }
    startTransition(async () => {
      const res = await scheduleMeeting({
        leadId,
        topic,
        start: when.toISOString(),
        durationMinutes: Number(duration),
        agenda: agenda || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.error || !res.meeting) {
        setError(res.error ?? "Could not book the meeting.");
        return;
      }
      setBooked({ joinUrl: res.meeting.joinUrl, password: res.meeting.password });
      toast.success("Zoom meeting booked.");
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" size="sm" onClick={show}>
        <Video className="h-4 w-4" /> Book Zoom meeting
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booked ? "Meeting booked" : "Book a Zoom meeting"}</DialogTitle>
          <DialogDescription>
            {booked
              ? "Share the join link with the lead. It is also on the Meetings page."
              : `You will be the host${leadName ? `. Linked to ${leadName}` : ""}.`}
          </DialogDescription>
        </DialogHeader>

        {booked ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-line bg-canvas p-2">
              <input readOnly value={booked.joinUrl} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" size="sm" variant="secondary" onClick={() => copy(booked.joinUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {booked.password && <p className="text-xs text-muted">Passcode: {booked.password}</p>}
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bm_topic">Topic</Label>
              <Input id="bm_topic" value={topic} onChange={(e) => setTopic(e.target.value)} required maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bm_start">Start</Label>
                <Input id="bm_start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bm_duration">Duration (minutes)</Label>
                <Input id="bm_duration" type="number" min={5} max={480} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bm_agenda">Agenda (optional)</Label>
              <Textarea id="bm_agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} maxLength={2000} />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book meeting"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
