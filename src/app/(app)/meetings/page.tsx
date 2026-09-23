import Link from "next/link";
import { Video, CalendarClock, CheckCircle2, Timer, Sparkles, PlugZap } from "lucide-react";
import { requireProfile } from "@/lib/auth/current-profile";
import { getZoomIntegration, listZoomMeetings } from "@/lib/actions/zoom";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleMeetingDialog } from "@/components/zoom/schedule-meeting-dialog";
import { MeetingsBoard } from "./meetings-board";

export default async function MeetingsPage() {
  const profile = await requireProfile();
  const [integration, meetings] = await Promise.all([getZoomIntegration(), listZoomMeetings()]);

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const weekAgo = now - 7 * 86400_000;

  const upcoming = meetings.filter((m) => m.status === "scheduled" && new Date(m.start_time).getTime() >= now - 10 * 60_000);
  const today = upcoming.filter((m) => new Date(m.start_time).getTime() <= endOfToday.getTime());
  const ended = meetings.filter((m) => m.status === "ended");
  const endedWeek = ended.filter((m) => new Date(m.start_time).getTime() >= weekAgo);
  const avgMinutes = ended.length
    ? Math.round(ended.reduce((s, m) => s + (m.actual_duration_minutes ?? m.duration_minutes), 0) / ended.length)
    : 0;
  const canManage = profile.role === "super_admin" || profile.role === "ops_manager";
  const readOnly = profile.role === "client_viewer";

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="brand-banner p-5 sm:p-6">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Video className="h-5 w-5" />
              </span>
              <h2 className="font-display text-2xl font-semibold">Zoom meetings</h2>
            </div>
            <p className="mt-1.5 max-w-xl text-sm text-white/80">
              {readOnly
                ? "Consultations our agents have booked with your leads over Zoom."
                : "Book video consultations straight from a call, start them in one click, and get the recording and AI summary back on the lead."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {integration.connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/25">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                  Connected as {integration.accountEmail}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-1">Zoom not connected</span>
              )}
              <span className="rounded-full bg-white/10 px-2.5 py-1">Demo mode (simulated meetings)</span>
            </div>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {integration.connected ? (
                <>
                  <ScheduleMeetingDialog
                    hostName={profile.full_name}
                    defaultInstant
                    trigger={
                      <Button variant="gold">
                        <Sparkles className="h-4 w-4" /> Instant meeting
                      </Button>
                    }
                  />
                  <ScheduleMeetingDialog
                    hostName={profile.full_name}
                    trigger={
                      <Button className="bg-white text-ink shadow-sm hover:bg-white/90" variant="secondary">
                        <CalendarClock className="h-4 w-4" /> Schedule
                      </Button>
                    }
                  />
                </>
              ) : canManage ? (
                <Button variant="gold" asChild>
                  <Link href="/admin/integrations">
                    <PlugZap className="h-4 w-4" /> Connect Zoom
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile className="stagger-1" icon={CalendarClock} value={today.length} label="Meetings left today" accent="blue" />
        <StatTile className="stagger-2" icon={Video} value={upcoming.length} label="Upcoming" accent="violet" />
        <StatTile className="stagger-3" icon={CheckCircle2} value={endedWeek.length} label="Held in the last 7 days" accent="green" />
        <StatTile className="stagger-4" icon={Timer} value={`${avgMinutes}m`} label="Average length" accent="gold" />
      </div>

      <MeetingsBoard
        meetings={meetings}
        hostName={profile.full_name}
        currentUserId={profile.id}
        readOnly={readOnly}
        showHost={profile.role !== "agent"}
      />

      {!readOnly && (
        <p className="text-center text-xs text-muted">
          Meetings are also available on each lead in the dial workspace.{" "}
          {canManage && (
            <Link href="/admin/integrations" className="font-medium text-brand-blue hover:underline">
              Manage the Zoom integration
            </Link>
          )}
        </p>
      )}
      <div className="flex justify-center">
        <Badge variant="zoom">Demo: “Start” opens a simulated Zoom meeting room</Badge>
      </div>
    </div>
  );
}
