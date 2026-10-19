import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SecurityPage() {
  const profile = await requireRole(["super_admin"]);

  const supabase = await createRealClient();
  const [{ data: auditRows }, { data: credentialEvents }, { data: people }, signIns] = await Promise.all([
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("credential_events").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("profiles").select("id, full_name, role").eq("workspace_id", profile.workspace_id),
    // Supabase Auth's own record of who signed in recently (service role:
    // auth.users isn't reachable through RLS).
    createServiceClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const recentSignIns = (signIns.data?.users ?? [])
    .filter((u) => names.has(u.id) && u.last_sign_in_at)
    .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))
    .slice(0, 25);

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
      <Card className="animate-slide-up lg:col-span-2">
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <tbody>
              {(auditRows ?? []).map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-1.5 tabular text-muted">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant="neutral">{row.action}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-ink">{row.entity_type}</td>
                  <td className="px-2 py-1.5 text-muted">{(row.actor_id && names.get(row.actor_id)) || "System"}</td>
                </tr>
              ))}
              {(auditRows ?? []).length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted" colSpan={4}>
                    No audited changes yet — the log fills as profiles, teams, clients and campaigns change.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>Recent sign-ins</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            {recentSignIns.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <span className="text-ink">{names.get(u.id)}</span>
                <span className="tabular text-muted">{new Date(u.last_sign_in_at!).toLocaleString()}</span>
              </div>
            ))}
            {recentSignIns.length === 0 && <p className="text-muted">No sign-ins recorded yet.</p>}
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>Credential events</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            {(credentialEvents ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <span className="text-ink">{names.get(e.user_id) ?? "Unknown"}</span>
                <Badge variant="neutral">{e.event.replace(/_/g, " ")}</Badge>
              </div>
            ))}
            {(credentialEvents ?? []).length === 0 && <p className="text-muted">No credential events yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
