import type { Metadata } from "next";
import Link from "next/link";
import { Video } from "lucide-react";
import { requireRole } from "@/lib/auth/current-profile";
import { listWorkspaceMeetings } from "@/lib/actions/zoom-meetings";
import { createServiceClient } from "@/lib/supabase/service";
import { MeetingsList } from "./meetings-list";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const profile = await requireRole(["super_admin", "ops_manager", "team_lead", "agent"]);
  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  const [meetings, { data: cred }] = await Promise.all([
    listWorkspaceMeetings(),
    createServiceClient().from("zoom_credentials").select("status").eq("workspace_id", profile.workspace_id).maybeSingle(),
  ]);
  const connected = cred?.status === "connected";
  const scope =
    profile.role === "agent"
      ? "You see meetings you host or that are on your leads."
      : profile.role === "team_lead"
        ? "You see meetings hosted by your team."
        : "You see every meeting in the workspace.";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Meetings</h2>
        <p className="text-sm text-muted">Zoom meetings booked with leads. {scope}</p>
      </div>

      {!connected && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm shadow-sm">
          <Video className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <div className="font-medium text-ink">Zoom is not connected for this workspace</div>
            <p className="mt-1 text-muted">
              {isManager ? (
                <>
                  Connect a Zoom Server-to-Server OAuth app to book and host meetings from here.{" "}
                  <Link href="/admin/settings/zoom" className="font-medium text-brand-green-text underline">
                    Connect Zoom
                  </Link>
                </>
              ) : (
                "Ask a workspace admin to connect Zoom under Settings > Zoom. Until then meetings cannot be booked."
              )}
            </p>
          </div>
        </div>
      )}

      <MeetingsList
        meetings={meetings.map((m) => ({
          id: m.id,
          topic: m.topic,
          startTime: m.start_time,
          durationMinutes: m.duration_minutes,
          status: m.status as "scheduled" | "started" | "ended" | "cancelled",
          joinUrl: m.join_url,
          leadName: m.lead_name,
          hostName: m.host_name,
          hostId: m.host_id,
        }))}
        meId={profile.id}
        isManager={isManager}
        connected={connected}
      />
    </div>
  );
}
