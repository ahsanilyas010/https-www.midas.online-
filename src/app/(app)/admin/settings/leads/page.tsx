import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import Link from "next/link";
import { ScreenButton } from "./screen-button";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Real-workspace only, same as branding settings — see that page's header
// comment.
export default async function LeadsSettingsPage() {
  const profile = await requireRealProfile();
  if (!["super_admin", "ops_manager"].includes(profile.role)) redirect("/start");

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();

  const [{ data: batches }] = await Promise.all([
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
        Every upload batch, and whether it has been screened. Screening here is a manual check against your suppression list; it is not a live TPS/CTPS or National DNC lookup.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <p className="max-w-lg text-sm text-ink">
          Uploading now happens in the new importer: pick a file, match its columns to name, phone number, company and email, review, then import. You can also call the leads yourself from there.
        </p>
        <Link
          href="/admin/import"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:brightness-110"
        >
          Upload leads
        </Link>
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
