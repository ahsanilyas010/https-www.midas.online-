import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { TwilioSettingsForm } from "./twilio-settings-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Real-workspace only, same as the other admin/settings pages.
export default async function TwilioSettingsPage() {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/admin");

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();

  const [{ data: credentials }, { data: numbers }] = await Promise.all([
    supabase.from("twilio_credentials").select("*").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("twilio_numbers").select("*").eq("workspace_id", workspace.id).order("phone_number"),
  ]);

  const connected = credentials?.status === "connected";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Twilio</h1>
      <p className="mt-1 text-sm text-muted">
        Your team dials from your own Twilio account. Call minutes bill to Twilio directly, never to us.
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-sm">
        {connected ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-brand-green-text" />
            <span className="font-medium text-ink">Connected</span>
            <span className="text-muted">— {numbers?.length ?? 0} number{numbers?.length === 1 ? "" : "s"} found.</span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-danger" />
            <span className="font-medium text-ink">Not connected</span>
            {credentials?.last_error && <span className="text-muted">— {credentials.last_error}</span>}
          </>
        )}
      </div>

      {connected && numbers && numbers.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Default caller ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {numbers.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2 font-mono">{n.phone_number}</td>
                  <td className="px-4 py-2 text-muted">{n.friendly_name ?? "—"}</td>
                  <td className="px-4 py-2">{n.phone_number === credentials?.caller_id_default ? "Yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">{connected ? "Reconnect or rotate credentials" : "Connect Twilio"}</h2>
        <div className="mt-4">
          <TwilioSettingsForm />
        </div>
      </div>
    </div>
  );
}
