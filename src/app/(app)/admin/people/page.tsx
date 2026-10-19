import { KeyRound } from "lucide-react";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { activeAgentCount } from "@/lib/workspace/limits";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CreateUserDialog } from "./create-user-dialog";
import { PeopleRowActions } from "./row-actions";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  ops_manager: "Ops manager",
  team_lead: "Team lead",
  qa_analyst: "QA analyst",
  agent: "Sales agent",
  lead_gen: "Lead gen",
  client: "Client",
};

// Last sign-in lives in Supabase Auth, not in profiles. Only admins see it.
async function lastSignIns(canSee: boolean): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!canSee) return map;
  const { data } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) map.set(u.id, u.last_sign_in_at ?? null);
  return map;
}

export default async function PeoplePage() {
  const profile = await requireRole(["super_admin", "ops_manager", "team_lead"]);
  const canCreate = profile.role === "super_admin" || profile.role === "ops_manager";

  const supabase = await createRealClient();
  const [workspace, { data: people }, { data: teams }, { data: clients }, { data: campaigns }, signIns] = await Promise.all([
    getCurrentWorkspace(),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name").order("name"),
    lastSignIns(canCreate),
  ]);
  const agentsUsed = await activeAgentCount(supabase, workspace.id);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted">{people?.length ?? 0} people · one login per human, no exceptions</p>
        {canCreate && <CreateUserDialog teams={teams ?? []} clients={clients ?? []} />}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-muted">
        <KeyRound className="h-4 w-4 text-brand-blue" />
        {workspace.plan === "free" ? "Free plan" : "Your plan"}: {agentsUsed} of {workspace.seat_limit} agent seats used. Admins,
        managers, team leads, lead gen, QA and client logins don&apos;t use a seat.
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Login</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Agent code</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
              {canCreate && <th className="px-3 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {(people ?? []).map((p) => {
              const last = signIns.get(p.id);
              return (
                <tr key={p.id} className="h-[38px] border-b border-line last:border-0 hover:bg-canvas/60">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {p.full_name
                            .split(" ")
                            .map((s: string) => s[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-ink">{p.full_name}</span>
                      {p.must_change_password && <Badge variant="warning">Must set password</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted">{p.email}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="blue">{ROLE_LABEL[p.role]}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-muted">{(p.team_id && teamName.get(p.team_id)) || "—"}</td>
                  <td className="px-3 py-1.5 tabular text-muted">{p.agent_code ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {p.is_active ? <Badge variant="confirm">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}
                  </td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">
                    {canCreate ? (last ? new Date(last).toLocaleString() : "Never") : "—"}
                  </td>
                  {canCreate && (
                    <td className="px-3 py-1.5 text-right">
                      <PeopleRowActions
                        userId={p.id}
                        userName={p.full_name}
                        isActive={p.is_active}
                        campaigns={p.role === "agent" ? (campaigns ?? []) : []}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {(people ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                  No one here yet. Create the first account above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
