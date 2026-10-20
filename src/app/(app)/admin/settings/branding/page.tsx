import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Real-workspace only, same as the rest of Phase 1's new surfaces (see
// src/lib/supabase/real.ts) — not linked from a sales-demo persona's nav,
// since branding for the shared demo dataset isn't a real, per-tenant
// concept the way it is for a real signed-up workspace.
export default async function BrandingSettingsPage() {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/admin");

  const workspace = await getCurrentWorkspace();

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Branding</h1>
      <p className="mt-1 text-sm text-muted">
        Your logo, colour and product name appear in the sidebar and header for every agent and client.
      </p>
      <div className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <BrandForm
          workspaceId={workspace.id}
          initial={{
            logoUrl: workspace.brand_logo_url,
            color: workspace.brand_primary_color,
            name: workspace.brand_product_name,
          }}
        />
      </div>
    </div>
  );
}
