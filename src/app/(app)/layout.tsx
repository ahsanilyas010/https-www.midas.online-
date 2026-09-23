import { requireProfile } from "@/lib/auth/current-profile";
import { navFor } from "@/lib/nav";
import { getCurrentSession } from "@/lib/actions/attendance";
import { getMyFollowups } from "@/lib/actions/followups";
import { AppChrome } from "@/components/shell/app-chrome";
import { getStore } from "@/lib/demo/store";

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

  // Demo bar "View as" list: every active person on the People page.
  const demoAccounts = getStore()
    .tables.profiles.filter((p) => p.is_active)
    .map((p) => ({ id: p.id as string, name: p.full_name as string, role: p.role as string }));

  return (
    <AppChrome
      profile={profile}
      initialSession={session}
      initialFollowups={followups}
      items={items}
      demoAccounts={demoAccounts}
    >
      {children}
    </AppChrome>
  );
}
