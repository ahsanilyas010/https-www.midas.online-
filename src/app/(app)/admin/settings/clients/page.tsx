import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { clientLogoUrl } from "@/lib/client-logo";
import { ClientLogoField } from "./client-logo-field";

export const metadata: Metadata = { title: "Clients & logos", robots: { index: false, follow: false } };

export default async function ClientSettingsPage() {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const supabase = await createRealClient();
  const { data: clients } = await supabase.from("clients").select("id, name, is_active").eq("workspace_id", profile.workspace_id).order("name");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Clients & logos</h1>
      <p className="mt-1 text-sm text-muted">
        Each client can have its own logo. Add or rename clients under{" "}
        <Link href="/admin/campaigns" className="text-brand-blue hover:underline">
          Campaigns
        </Link>
        .
      </p>
      <ul className="mt-6 flex flex-col gap-3">
        {(clients ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              {c.name}
              {!c.is_active && <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Inactive</span>}
            </div>
            <ClientLogoField workspaceId={profile.workspace_id} clientId={c.id} initialUrl={clientLogoUrl(profile.workspace_id, c.id)} />
          </li>
        ))}
        {(clients ?? []).length === 0 && (
          <li className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
            No clients yet. Create one under Campaigns, then come back to add its logo.
          </li>
        )}
      </ul>
    </div>
  );
}
