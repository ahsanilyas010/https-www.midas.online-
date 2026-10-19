import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/current-profile";
import { navFor } from "@/lib/nav";
import { getMyLatestEvent } from "@/lib/actions/attendance-v2";
import { getMyCallbacks } from "@/lib/actions/callbacks";
import { AppChrome } from "@/components/shell/app-chrome";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { activeAgentCount } from "@/lib/workspace/limits";
import { createRealClient } from "@/lib/supabase/real";

// The signed-in app is not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Roles that can place or receive calls (and so get the Zoom Phone dock).
const DIAL_ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "qa_analyst"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const items = navFor(profile.role);

  // Attendance and callbacks are staff concepts — a client login has no
  // shift to clock into and no leads to follow up on, so skip the queries
  // and let Header hide that chrome entirely for this role.
  const isStaff = profile.role !== "client" && profile.role !== "lead_gen";
  const supabase = await createRealClient();
  const [workspace, event, callbacks, agentsUsed] = await Promise.all([
    getCurrentWorkspace(),
    isStaff ? getMyLatestEvent() : Promise.resolve(null),
    isStaff ? getMyCallbacks() : Promise.resolve([]),
    activeAgentCount(supabase, profile.workspace_id),
  ]);

  const planInfo = {
    workspaceName: workspace.name,
    plan: workspace.plan,
    agentsUsed,
    agentSeats: workspace.seat_limit,
    canManageBilling: profile.role === "super_admin",
    isRealDemo: workspace.is_demo,
  };

  const branding = { logoUrl: workspace.brand_logo_url ?? null, productName: workspace.brand_product_name ?? null };

  return (
    <AppChrome
      profile={profile}
      initialEvent={event}
      initialCallbacks={callbacks}
      items={items}
      planInfo={planInfo}
      branding={branding}
      enablePhone={DIAL_ROLES.includes(profile.role)}
    >
      {children}
    </AppChrome>
  );
}
