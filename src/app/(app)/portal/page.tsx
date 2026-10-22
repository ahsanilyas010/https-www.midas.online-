import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { getClientPortalData } from "@/lib/actions/client-portal";
import { PortalClient } from "./portal-client";
import { ClientSelector } from "./client-selector";

export const metadata: Metadata = { title: "Client reports", robots: { index: false, follow: false } };

// Client reporting. A client login sees only their own campaigns; an admin
// or ops manager previews any one client's report (?client=<id>). Read-only
// and aggregate: never a phone number or recording (the underlying
// SECURITY DEFINER functions structurally can't return one).
export default async function ClientPortalPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const profile = await requireProfile();
  const isManager = profile.role === "super_admin" || profile.role === "ops_manager";
  if (profile.role !== "client" && !isManager) redirect("/start");

  if (!isManager) {
    const data = await getClientPortalData(true);
    return <PortalClient initialData={data} />;
  }

  const supabase = await createRealClient();
  const { data: clients } = await supabase.from("clients").select("id, name").eq("is_active", true).order("name");
  const { client } = await searchParams;
  const selected = clients?.find((c) => c.id === client) ?? clients?.[0];

  if (!selected) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Client reports</h1>
        <p className="mt-2 text-sm text-muted">No clients yet. Create one under Campaigns and its report appears here.</p>
      </div>
    );
  }

  const data = await getClientPortalData(false, selected.id);
  return (
    <div>
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 pt-6">
        <span className="text-sm text-muted">Viewing report for</span>
        <ClientSelector clients={clients ?? []} current={selected.id} />
      </div>
      <PortalClient key={selected.id} initialData={data} clientId={selected.id} />
    </div>
  );
}
