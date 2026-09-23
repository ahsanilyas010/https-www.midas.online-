import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CreateUserDialog } from "./create-user-dialog";
import { PeopleRowActions } from "./row-actions";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  ops_manager: "Ops manager",
  team_lead: "Team lead",
  qa: "QA",
  agent: "Agent",
  client_viewer: "Client",
};

export default async function PeoplePage() {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) {
    redirect("/");
  }

  const supabase = await createClient();
  const [{ data: people }, { data: teams }, { data: clients }, { data: campaigns }] = await Promise.all([
    supabase
      .from("profiles")
      // profiles.team_id -> teams.id AND teams.team_lead_id -> profiles.id
      // both exist, so an unqualified `teams(name)` embed is ambiguous and
      // PostgREST rejects the whole query — silently rendering as "0 people"
      // since the error was never checked. Same fix pattern already used
      // for profiles embeds on audit_log/credential_events.
      .select("*, teams!profiles_team_id_fkey(name)")
      .order("full_name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("campaigns").select("id, name, code").order("name"),
  ]);

  const canCreate = profile.role === "super_admin" || profile.role === "ops_manager";

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">
            {people?.length ?? 0} people · one login per human, no exceptions
          </p>
        </div>
        {canCreate && <CreateUserDialog teams={teams ?? []} clients={clients ?? []} />}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Agent code</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last login</th>
              {canCreate && <th className="px-3 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {(people ?? []).map((p) => (
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
                    {p.must_change_password && (
                      <Badge variant="warning">Must set password</Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <Badge variant="blue">{ROLE_LABEL[p.role]}</Badge>
                </td>
                <td className="px-3 py-1.5 text-muted">
                  {(p as { teams?: { name: string } | null }).teams?.name ?? "—"}
                </td>
                <td className="px-3 py-1.5 tabular text-muted">{p.agent_code ?? "—"}</td>
                <td className="px-3 py-1.5">
                  {p.is_active ? (
                    <Badge variant="confirm">Active</Badge>
                  ) : (
                    <Badge variant="danger">Deactivated</Badge>
                  )}
                </td>
                <td className="px-3 py-1.5 tabular text-xs text-muted">
                  {p.last_login_at ? new Date(p.last_login_at).toLocaleString() : "Never"}
                </td>
                {canCreate && (
                  <td className="px-3 py-1.5 text-right">
                    <PeopleRowActions
                      userId={p.id}
                      userName={p.full_name}
                      isActive={p.is_active}
                      campaigns={campaigns ?? []}
                    />
                  </td>
                )}
              </tr>
            ))}
            {(people ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
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
