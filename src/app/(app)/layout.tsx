import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/current-profile";
import { navFor } from "@/lib/nav";
import { getCurrentSession } from "@/lib/actions/attendance";
import { getMyFollowups } from "@/lib/actions/followups";
import { AppChrome } from "@/components/shell/app-chrome";
import { getStore } from "@/lib/demo/store";
import { getWorkspaceContext } from "@/lib/accounts/session";
import { activeAgentCount } from "@/lib/accounts/limits";
import { getDialerState } from "@/lib/actions/dialer";
import { providerMeta } from "@/lib/telephony/providers";
import type { DialerInfo } from "@/components/dialer/dialer-context";

// The signed-in demo app is not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const items = navFor(profile.role);
  // Attendance and follow-ups are staff concepts — a client login has no
  // shift to clock into and no leads to follow up on, so skip the queries
  // and let Header hide that chrome entirely for this role.
  const isStaff = profile.role !== "client_viewer";
  const [session, followups] = isStaff
    ? await Promise.all([getCurrentSession(), getMyFollowups()])
    : [null, []];

  // The softphone is for staff; client logins only see reports.
  const dialerState = isStaff ? await getDialerState() : null;
  const meta = providerMeta(dialerState?.provider);
  const dialer: DialerInfo = {
    enabled: isStaff,
    connected: Boolean(dialerState?.connected),
    providerKey: meta?.key ?? null,
    providerName: meta?.name ?? null,
    providerColor: meta?.color ?? "#6b6889",
    providerInitials: meta?.initials ?? "—",
    callerId: dialerState?.settings.caller_id || null,
    numbers: dialerState?.settings.numbers ?? [],
    recordCalls: dialerState?.settings.record_calls ?? false,
    canManage: profile.role === "super_admin" || profile.role === "ops_manager",
  };

  // Customers see their plan; the demo gets the "View as" list of every
  // active person on the People page.
  const ws = await getWorkspaceContext();
  const planInfo = ws
    ? {
        workspaceName: ws.workspace.name,
        plan: ws.workspace.plan,
        agentsUsed: activeAgentCount(ws.store),
        agentSeats: ws.workspace.agentSeats,
        canManageBilling: profile.role === "super_admin",
      }
    : null;
  const demoAccounts = ws
    ? []
    : getStore()
        .tables.profiles.filter((p) => p.is_active)
        .map((p) => ({ id: p.id as string, name: p.full_name as string, role: p.role as string }));

  return (
    <AppChrome
      profile={profile}
      initialSession={session}
      initialFollowups={followups}
      items={items}
      demoAccounts={demoAccounts}
      planInfo={planInfo}
      dialer={dialer}
    >
      {children}
    </AppChrome>
  );
}
