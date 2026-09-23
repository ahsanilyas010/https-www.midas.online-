import { redirect } from "next/navigation";
import { Mail, Building, ShieldCheck, Flag, Database, CircleDashed } from "lucide-react";
import { requireProfile } from "@/lib/auth/current-profile";
import { getZoomIntegration, listZoomMeetings } from "@/lib/actions/zoom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoomIntegrationCard } from "./zoom-integration-card";

export default async function IntegrationsPage() {
  const profile = await requireProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/");

  const [zoom, meetings] = await Promise.all([getZoomIntegration(), listZoomMeetings()]);

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
        <p className="text-sm text-muted">Connect the tools your floor already uses. Zoom is fully wired into the dial workspace.</p>
      </div>

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
