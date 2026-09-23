import type { Enums } from "@/lib/supabase/types";

export type AppRole = Enums<"app_role">;

// Icon names only (strings, not component references) — this array is
// built server-side in the (app) layout and passed as a prop into Client
// Components (Sidebar via AppChrome). React Server Components can't
// serialize a raw function/component reference across that boundary, only
// plain data — so the actual lucide-react component lookup happens
// client-side in Sidebar via ICON_MAP, keyed by this string.
export type NavIconName =
  | "Activity"
  | "BarChart3"
  | "Users"
  | "Megaphone"
  | "CalendarCheck"
  | "ShieldCheck"
  | "Database"
  | "Lock"
  | "Headset"
  | "Building2";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  roles: AppRole[];
}

// Section 6.8 — eight admin sections, cross-campaign by default.
// team_lead sees a scoped subset (Live Floor, Performance, People read-only,
// Attendance with approval rights) per the spec's design constraints.
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Live floor", icon: "Activity", roles: ["super_admin", "ops_manager", "team_lead"] },
  { href: "/admin/performance", label: "Performance", icon: "BarChart3", roles: ["super_admin", "ops_manager", "team_lead"] },
  { href: "/admin/people", label: "People", icon: "Users", roles: ["super_admin", "ops_manager", "team_lead"] },
  { href: "/admin/campaigns", label: "Campaigns", icon: "Megaphone", roles: ["super_admin", "ops_manager"] },
  { href: "/admin/attendance", label: "Attendance", icon: "CalendarCheck", roles: ["super_admin", "ops_manager", "team_lead"] },
  { href: "/admin/compliance", label: "Compliance", icon: "ShieldCheck", roles: ["super_admin", "ops_manager"] },
  { href: "/admin/data", label: "Data", icon: "Database", roles: ["super_admin", "ops_manager"] },
  { href: "/client", label: "Client reports", icon: "Building2", roles: ["super_admin", "ops_manager"] },
  { href: "/admin/security", label: "Security & audit", icon: "Lock", roles: ["super_admin"] },
];

export const PRIMARY_NAV: NavItem[] = [
  { href: "/workspace", label: "Dial workspace", icon: "Headset", roles: ["agent"] },
  { href: "/workspace/leads", label: "My leads", icon: "Users", roles: ["agent"] },
  { href: "/client", label: "Reports", icon: "Building2", roles: ["client_viewer"] },
  { href: "/qa", label: "QA queue", icon: "ShieldCheck", roles: ["qa"] },
  ...ADMIN_NAV,
];

export function navFor(role: AppRole): NavItem[] {
  return PRIMARY_NAV.filter((item) => item.roles.includes(role));
}

export function homeFor(role: AppRole): string {
  switch (role) {
    case "agent":
      return "/workspace";
    case "client_viewer":
      return "/client";
    case "qa":
      return "/qa";
    default:
      return "/admin";
  }
}
