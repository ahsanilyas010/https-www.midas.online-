import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { EmailTemplatesClient } from "./email-templates-client";

export const metadata: Metadata = { title: "Email settings", robots: { index: false, follow: false } };

export default async function EmailSettingsPage() {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/admin");

  const supabase = await createRealClient();
  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Email templates</h1>
      <p className="mt-1 text-sm text-muted">Only approved templates can be sent to a lead.</p>
      <div className="mt-6">
        <EmailTemplatesClient templates={templates ?? []} />
      </div>
    </div>
  );
}
