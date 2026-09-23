import { redirect } from "next/navigation";
import { Mail, Building, ShieldCheck, Flag, Database, CircleDashed } from "lucide-react";
import { requireProfile } from "@/lib/auth/current-profile";
import { getZoomIntegration, listZoomMeetings } from "@/lib/actions/zoom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoomIntegrationCard } from "./zoom-integration-card";
import { DialerIntegration } from "./dialer-integration";
import { getDialerState, listRecentCalls, previewDialerRequest } from "@/lib/actions/dialer";
import { DIALER_PROVIDERS } from "@/lib/telephony/providers";

export default async function IntegrationsPage() {
  const profile = await requireProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/start");

  const [zoom, meetings, dialer, calls] = await Promise.all([
    getZoomIntegration(),
    listZoomMeetings(),
    getDialerState(),
    listRecentCalls(500),
  ]);
  const previews = Object.fromEntries(
    await Promise.all(DIALER_PROVIDERS.map(async (p) => [p.key, await previewDialerRequest(p.key)] as const)),
  );
  const today = new Date().toISOString().slice(0, 10);
  const todays = calls.filter((c) => c.started_at.slice(0, 10) === today);
  const answered = calls.filter((c) => c.status === "completed");
  const avg = answered.length ? Math.round(answered.reduce((s, c) => s + c.duration_seconds, 0) / answered.length) : 0;
  const stats = {
    callsToday: todays.length,
    connectRate: calls.length ? `${Math.round((answered.length / calls.length) * 100)}%` : "—",
    avgDuration: `${Math.floor(avg / 60)}m ${String(avg % 60).padStart(2, "0")}s`,
  };

  const others = [
    { icon: Mail, name: "Email", text: "Template emails to leads with unsubscribe handling. Sends are simulated." },
    { icon: Building, name: "Companies House", text: "UK company search for B2B data sourcing." },
    { icon: ShieldCheck, name: "TPS / CTPS bureau", text: "UK do-not-call screening before dialling." },
    { icon: Flag, name: "US National DNC", text: "FTC Do Not Call registry screening." },
    { icon: Database, name: "Database", text: "The demo runs on in-memory sample data. Nothing is stored permanently." },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Integrations</h2>
        <p className="text-sm text-muted">
          Connect the tools your floor already uses: the dialer your team subscribes to for calls, and Zoom for video meetings.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Calling</h3>
        <DialerIntegration state={dialer} previews={previews} stats={stats} />
      </section>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Video meetings</h3>

      <ZoomIntegrationCard
        integration={zoom}
        meetingCount={meetings.length}
        endedCount={meetings.filter((m) => m.status === "ended").length}
      />

      <Card>
        <CardHeader>
          <CardTitle>Other services</CardTitle>
          <CardDescription>Shown for completeness. In this demo each one runs in simulated mode.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map(({ icon: Icon, name, text }, i) => (
            <div key={name} className={`hover-lift animate-slide-up stagger-${i + 1} rounded-xl border border-line bg-surface p-3`}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue-tint text-brand-blue">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <Badge variant="neutral">
                  <CircleDashed className="h-3 w-3" /> Simulated
                </Badge>
              </div>
              <div className="mt-2 text-sm font-semibold text-ink">{name}</div>
              <div className="text-xs text-muted">{text}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
