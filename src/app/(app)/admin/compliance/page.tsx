import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSuppressionDialog } from "./add-suppression-dialog";
import { RunScreeningDialog } from "./run-screening-dialog";

export default async function CompliancePage() {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "qa"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const [
    { data: entries, count },
    { count: passedCount },
    { count: expiredCount },
    { count: unscreenedCount },
    { count: outOfWindowCount },
    { data: campaigns },
    { data: screeningRuns },
  ] = await Promise.all([
    supabase
      .from("suppression_list")
      .select("*, profiles(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(50),
    // head:true counts exactly, at any table size — a plain
    // .select("screening_status") over every lead used to under-count
    // silently past Supabase's default 1000-row page size.
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("screening_status", "passed"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("screening_status", "expired"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("screening_status", "unscreened"),
    supabase
      .from("call_attempts")
      .select("id", { count: "exact", head: true })
      .eq("within_call_window", false),
    supabase.from("campaigns").select("id, name, code").order("name"),
    supabase
      .from("suppression_runs")
      .select("*, campaigns(name, code), profiles(full_name)")
      .order("ran_at", { ascending: false })
      .limit(20),
  ]);

  const counts = {
    passed: passedCount ?? 0,
    expired: expiredCount ?? 0,
    unscreened: unscreenedCount ?? 0,
  };

  return (
    <div className="p-4">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="animate-slide-up">
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular text-brand-green-text">
              {counts.passed ?? 0}
            </div>
            <div className="text-xs text-muted">Passed screening</div>
          </CardContent>
        </Card>
        <Card className="animate-slide-up">
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular text-warning">
              {counts.expired ?? 0}
            </div>
            <div className="text-xs text-muted">Expired</div>
          </CardContent>
        </Card>
        <Card className="animate-slide-up">
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular text-danger">
              {counts.unscreened ?? 0}
            </div>
            <div className="text-xs text-muted">Unscreened</div>
          </CardContent>
        </Card>
        <Card className="animate-slide-up">
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular text-ink">{count ?? 0}</div>
            <div className="text-xs text-muted">Suppressed numbers</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 animate-slide-up">
        <CardContent className="flex items-center justify-between pt-4">
          <div>
            <div className="text-xs font-medium text-ink">Calling-window monitor</div>
            <p className="text-[11px] text-muted">
              Calls logged outside the lead&rsquo;s permitted local hours. Section 6.5: this should
              always be zero — if it isn&rsquo;t, something upstream is broken.
            </p>
          </div>
          {(outOfWindowCount ?? 0) === 0 ? (
            <Badge variant="confirm">0 — clean</Badge>
          ) : (
            <Badge variant="danger">{outOfWindowCount} out-of-window calls</Badge>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4 animate-slide-up">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Screening runs</CardTitle>
          <RunScreeningDialog campaigns={campaigns ?? []} />
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Campaign</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Submitted</th>
                <th className="px-4 py-2 font-medium">Matched</th>
                <th className="px-4 py-2 font-medium">Evidence</th>
                <th className="px-4 py-2 font-medium">Valid until</th>
                <th className="px-4 py-2 font-medium">Ran by</th>
              </tr>
            </thead>
            <tbody>
              {(screeningRuns ?? []).map((r) => (
                <tr key={r.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-4 py-1.5 text-xs text-muted">
                    {(r as { campaigns?: { code: string } | null }).campaigns?.code ?? "—"}
                  </td>
                  <td className="px-4 py-1.5">
                    <Badge variant={r.provider === "INTERNAL" ? "neutral" : "blue"}>{r.provider}</Badge>
                  </td>
                  <td className="px-4 py-1.5 tabular text-muted">{r.numbers_submitted ?? 0}</td>
                  <td className="px-4 py-1.5 tabular text-muted">{r.numbers_matched ?? 0}</td>
                  <td className="px-4 py-1.5 text-xs text-muted">
                    {r.evidence_path ? "On file" : "Internal check — no file"}
                  </td>
                  <td className="px-4 py-1.5 tabular text-xs text-muted">
                    {r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-muted">
                    {(r as { profiles?: { full_name: string } | null }).profiles?.full_name ?? "—"}
                  </td>
                </tr>
              ))}
              {(screeningRuns ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                    No screening runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="animate-slide-up">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Suppression list</CardTitle>
          <AddSuppressionDialog />
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Added by</th>
                <th className="px-4 py-2 font-medium">Note</th>
                <th className="px-4 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.phone_e164} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-4 py-1.5 tabular font-medium text-ink">{e.phone_e164}</td>
                  <td className="px-4 py-1.5">
                    <Badge variant="danger">{e.reason.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-4 py-1.5 text-muted">
                    {(e as { profiles?: { full_name: string } | null }).profiles?.full_name ??
                      "System"}
                  </td>
                  <td className="px-4 py-1.5 text-muted">{e.evidence_note ?? "—"}</td>
                  <td className="px-4 py-1.5 tabular text-xs text-muted">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                    No suppressed numbers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="mt-3 text-[11px] text-muted">
        The internal suppression gate is unconditional — any signed-in user can add a number here,
        and it blocks that number in <code className="tabular">v_dialable_leads</code> the instant
        it commits. Screening runs are real too: &ldquo;Run screening&rdquo; above always offers the
        internal check, and any TPS/CTPS/US DNC/state result can be applied by uploading the
        bureau&rsquo;s own response file as retained evidence — there is no live bureau API
        integration yet (needs a real account per spec section 9), so that path is
        <code className="tabular"> ManualEvidenceProvider</code>, not an automated one. The
        retention/purge action and a downloadable evidence vault are the remaining compliance
        console gaps.
      </p>
    </div>
  );
}
