import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { getLiveFloorData } from "@/lib/actions/live-floor";
import { getMyLatestEvent } from "@/lib/actions/attendance-v2";
import { LiveFloorClient } from "./live-floor-client";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STAFF_ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "qa_analyst"];

// Real-workspace live floor (Phase 5) — separate from the legacy
// demo-store-backed /admin, which stays the sales demo's live floor. A
// real customer's "Live floor" nav link is swapped to this path in
// (app)/layout.tsx the same way "Dial workspace" is swapped to /dial.
export default async function LiveFloorPage() {
  const profile = await requireRealProfile();
  if (!STAFF_ROLES.includes(profile.role)) redirect("/start");

  const workspace = await getCurrentWorkspace();
  const [data, myLatestEvent] = await Promise.all([getLiveFloorData(), getMyLatestEvent()]);

  return (
    <LiveFloorClient
      workspaceId={workspace.id}
      initialData={data}
      myLatestEvent={myLatestEvent}
      canManage={profile.role === "super_admin" || profile.role === "ops_manager"}
    />
  );
}
