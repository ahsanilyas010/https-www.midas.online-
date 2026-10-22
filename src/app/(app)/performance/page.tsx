import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";

export const metadata: Metadata = { title: "Performance", robots: { index: false, follow: false } };

function formatMinutes(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Real-workspace performance (Phase 6) — the campaign funnel and agent
// scorecard, both built as Postgres views (v_campaign_funnel,
// v_agent_scorecard, migration 00000000000059) so the numbers are always
// live, never a separately-maintained rollup.
export default async function PerformancePage() {
  const profile = await requireRealProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) redirect("/start");

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();

  const [{ data: funnel }, { data: scorecard }] = await Promise.all([
    supabase.from("v_campaign_funnel").select("*").eq("workspace_id", workspace.id),
    supabase.from("v_agent_scorecard").select("*").eq("workspace_id", workspace.id),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Performance</h1>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Campaign funnel</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Loaded</th>
                <th className="px-4 py-3">Screened</th>
                <th className="px-4 py-3">Dialled</th>
                <th className="px-4 py-3">Connected</th>
                <th className="px-4 py-3">Converted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(funnel ?? []).map((f) => (
                <tr key={f.campaign_id}>
                  <td className="px-4 py-3 font-medium text-ink">{f.campaign_name}</td>
                  <td className="px-4 py-3">{f.loaded}</td>
                  <td className="px-4 py-3">{f.screened}</td>
                  <td className="px-4 py-3">{f.dialled}</td>
                  <td className="px-4 py-3">{f.connected}</td>
                  <td className="px-4 py-3">{f.converted}</td>
                </tr>
              ))}
              {(funnel ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Agent scorecard</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Calls</th>
                <th className="px-4 py-3">Connects</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Talk time</th>
                <th className="px-4 py-3">Avg wrap-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(scorecard ?? []).map((s) => (
                <tr key={s.agent_id}>
                  <td className="px-4 py-3 font-medium text-ink">{s.agent_name}</td>
                  <td className="px-4 py-3">{s.calls}</td>
                  <td className="px-4 py-3">{s.connects}</td>
                  <td className="px-4 py-3">{s.conversions}</td>
                  <td className="px-4 py-3">{formatMinutes(s.talk_seconds ?? 0)}</td>
                  <td className="px-4 py-3">{formatMinutes(s.avg_wrap_seconds ?? 0)}</td>
                </tr>
              ))}
              {(scorecard ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
