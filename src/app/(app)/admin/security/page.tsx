import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SecurityPage() {
  const profile = await requireProfile();
  if (profile.role !== "super_admin") redirect("/");

  const supabase = await createClient();
  const [{ data: auditRows }, { data: sessions }, { data: credentialEvents }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("*, profiles!audit_log_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("user_sessions")
      .select("*, profiles(full_name)")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(25),
    supabase
      .from("credential_events")
      .select("*, profiles!credential_events_user_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

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
                  <td className="px-4 py-1.5 tabular text-muted whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant="neutral">{row.action}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-ink">{row.entity_type}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {(row as { profiles?: { full_name: string } | null }).profiles?.full_name ??
                      "System"}
                  </td>
                </tr>
              ))}
              {(auditRows ?? []).length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted" colSpan={4}>
                    No audited changes yet — the log fills as profiles, teams, clients and
                    campaigns change.
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
            <CardTitle>Active sessions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            {(sessions ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span className="text-ink">
                  {(s as { profiles?: { full_name: string } | null }).profiles?.full_name ??
                    "Unknown"}
                </span>
                <span className="tabular text-muted">
                  {s.started_at ? new Date(s.started_at).toLocaleTimeString() : "—"}
                </span>
              </div>
            ))}
            {(sessions ?? []).length === 0 && <p className="text-muted">No active sessions.</p>}
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>Credential events</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs">
            {(credentialEvents ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <span className="text-ink">
                  {(e as { profiles?: { full_name: string } | null }).profiles?.full_name ??
                    "Unknown"}
                </span>
                <Badge variant="neutral">{e.event.replace(/_/g, " ")}</Badge>
              </div>
            ))}
            {(credentialEvents ?? []).length === 0 && (
              <p className="text-muted">No credential events yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
