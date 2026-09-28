import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { UploadForm, ScreenButton } from "./upload-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Real-workspace only, same as branding settings — see that page's header
// comment.
export default async function LeadsSettingsPage() {
  const profile = await requireRealProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) redirect("/admin");

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();

  const [{ data: campaigns }, { data: batches }] = await Promise.all([
    supabase.from("campaigns").select("id, name").eq("workspace_id", workspace.id).order("name"),
    supabase
      .from("lead_batches")
      .select("id, source, row_count, status, screened_at, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Data</h1>
      <p className="mt-1 text-sm text-muted">
        Upload leads, then mark a batch screened once it&apos;s cleared TPS/CTPS or National DNC checks.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <UploadForm campaigns={campaigns ?? []} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Rows</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Screened</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(batches ?? []).map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-medium text-ink">{b.source ?? "—"}</td>
                <td className="px-4 py-3">{b.row_count}</td>
                <td className="px-4 py-3 capitalize">{b.status}</td>
                <td className="px-4 py-3 text-muted">{b.screened_at ? new Date(b.screened_at).toLocaleDateString() : "Not yet"}</td>
                <td className="px-4 py-3 text-muted">{new Date(b.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">{!b.screened_at && <ScreenButton batchId={b.id} />}</td>
              </tr>
            ))}
            {(batches ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No uploads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
