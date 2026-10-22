import type { AppRole } from "@/lib/nav";

// What each login type can do, in one line, shown when picking a role.
// Only agents use a paid seat.
export const ROLE_INFO: { value: AppRole; label: string; description: string; usesSeat: boolean }[] = [
  { value: "agent", label: "Sales agent", description: "Makes the calls: dial workspace, call sheet and their own meetings.", usesSeat: true },
  { value: "lead_gen", label: "Lead gen", description: "Finds and hands over leads. Cannot see call data or dial.", usesSeat: false },
  { value: "team_lead", label: "Team lead", description: "Watches their team live and manages its people and attendance.", usesSeat: false },
  { value: "qa_analyst", label: "QA analyst", description: "Scores recorded calls. Read-only otherwise.", usesSeat: false },
  { value: "ops_manager", label: "Ops manager", description: "Runs campaigns, leads, compliance and people. Cannot manage billing or security.", usesSeat: false },
  { value: "super_admin", label: "Super admin", description: "Full control, including billing, security and other admins.", usesSeat: false },
  { value: "client", label: "Client viewer", description: "Sees reports for one client only.", usesSeat: false },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_INFO.map((r) => [r.value, r.label]));
