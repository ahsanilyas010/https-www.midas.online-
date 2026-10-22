"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Play, X } from "lucide-react";
import { cancelMeeting, getStartUrl } from "@/lib/actions/zoom-meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface MeetingItem {
  id: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
  status: "scheduled" | "started" | "ended" | "cancelled";
  joinUrl: string;
  leadName: string | null;
  hostName: string | null;
  hostId: string;
}

function bucket(m: MeetingItem, now: number): "today" | "upcoming" | "past" {
  const start = new Date(m.startTime);
  const end = start.getTime() + m.durationMinutes * 60_000;
  if (m.status === "cancelled" || m.status === "ended" || end < now) return "past";
  const sameDay = start.toDateString() === new Date(now).toDateString();
  return sameDay || start.getTime() < now ? "today" : "upcoming";
}

function Row({ m, meId, isManager, past }: { m: MeetingItem; meId: string; isManager: boolean; past: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const isHost = m.hostId === meId;

  function start() {
    startTransition(async () => {
      const res = await getStartUrl(m.id);
      if (res.error || !res.url) return void toast.error(res.error ?? "Could not start the meeting.");
      window.open(res.url, "_blank", "noopener,noreferrer");
      router.refresh();
    });
  }
  function cancel() {
    if (!window.confirm(`Cancel "${m.topic}"? It will be deleted in Zoom.`)) return;
    startTransition(async () => {
      const res = await cancelMeeting(m.id);
      if (res.error) return void toast.error(res.error);
      toast.success("Meeting cancelled.");
      router.refresh();
    });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.joinUrl);
      toast.success("Join link copied.");
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 font-medium text-ink">{m.topic}</td>
      <td className="px-3 py-2 text-muted">{m.leadName ?? "-"}</td>
      <td className="px-3 py-2 text-muted">{m.hostName ?? "-"}</td>
      <td className="px-3 py-2 tabular text-muted">
        {new Date(m.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        <span className="ml-1 text-xs">({m.durationMinutes} min)</span>
      </td>
      <td className="px-3 py-2">
        <Badge variant={m.status === "cancelled" ? "warning" : m.status === "started" ? "confirm" : "neutral"}>{m.status}</Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {!past && (
            <a href={m.joinUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" size="sm" variant="secondary">
                <ExternalLink className="h-4 w-4" /> Join
              </Button>
            </a>
          )}
          {!past && isHost && (
            <Button type="button" size="sm" onClick={start} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
            </Button>
          )}
          {m.status !== "cancelled" && (
            <Button type="button" size="sm" variant="secondary" onClick={copy} title="Copy join link">
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {!past && (isHost || isManager) && (
            <Button type="button" size="sm" variant="secondary" onClick={cancel} disabled={busy} title="Cancel meeting">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function MeetingsList({
  meetings,
  meId,
  isManager,
  connected,
}: {
  meetings: MeetingItem[];
  meId: string;
  isManager: boolean;
  connected: boolean;
}) {
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => {
    const g = { today: [] as MeetingItem[], upcoming: [] as MeetingItem[], past: [] as MeetingItem[] };
    for (const m of meetings) g[bucket(m, now)].push(m);
    g.past.reverse();
    return g;
  }, [meetings, now]);

  const tabs = [
    { key: "upcoming", label: "Upcoming", empty: "No upcoming meetings." },
    { key: "today", label: "Today", empty: "No meetings today." },
    { key: "past", label: "Past", empty: "No past meetings." },
  ] as const;

  return (
    <Tabs defaultValue={groups.today.length > 0 ? "today" : "upcoming"}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label} ({groups[t.key].length})
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-3">
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {groups[t.key].map((m) => (
                  <Row key={m.id} m={m} meId={meId} isManager={isManager} past={t.key === "past"} />
                ))}
                {groups[t.key].length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                      {t.empty}{" "}
                      {meetings.length === 0 &&
                        (connected
                          ? "Book one from a lead on the Call sheet or the dial screen."
                          : "Zoom needs to be connected first (Settings > Zoom).")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
