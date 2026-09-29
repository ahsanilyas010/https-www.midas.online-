"use server";

import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";

export interface ClientPortalData {
  funnel: { campaign_id: string; campaign_name: string; loaded: number; screened: number; dialled: number; connected: number; converted: number }[];
  outcomes: { disposition_label: string; outcome_group: string; count: number }[];
  activity: { agent_label: string; calls: number; connects: number; conversions: number }[];
}

// Every field here comes from a SECURITY DEFINER function scoped to the
// caller's own client_id (migration 00000000000064) — this action is a
// thin wrapper, not where the access boundary actually lives.
export async function getClientPortalData(anonymize: boolean): Promise<ClientPortalData> {
  const profile = await requireRealProfile();
  if (profile.role !== "client") throw new Error("Only a client login can view the client portal.");

  const supabase = await createRealClient();
  const [{ data: funnel }, { data: outcomes }, { data: activity }] = await Promise.all([
    supabase.rpc("client_campaign_funnel"),
    supabase.rpc("client_disposition_breakdown"),
    supabase.rpc("client_agent_activity", { p_anonymize: anonymize }),
  ]);

  return { funnel: funnel ?? [], outcomes: outcomes ?? [], activity: activity ?? [] };
}

// Spec: "monthly PDF report generated server-side and stored in Storage."
// Generates on demand rather than only on a schedule — a client can
// always get this month's report immediately instead of waiting for a
// cron job neither of us can verify runs in this environment.
export async function generateMonthlyReport(): Promise<{ error?: string; path?: string }> {
  const profile = await requireRealProfile();
  if (profile.role !== "client" && profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Not authorized." };
  }

  const { renderClientReportPdf } = await import("@/lib/reports/client-report-pdf-v2");
  const data = await getClientPortalData(profile.role === "client" ? true : false);

  const pdfBuffer = await renderClientReportPdf({
    monthLabel: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    ...data,
  });

  const admin = createServiceClient();
  const path = `${profile.workspace_id}/${new Date().toISOString().slice(0, 7)}-client-report.pdf`;
  const { error } = await admin.storage.from("client-reports").upload(path, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (error) return { error: error.message };

  return { path };
}

export async function getReportDownloadUrl(path: string): Promise<{ url?: string; error?: string }> {
  const profile = await requireRealProfile();
  if (!path.startsWith(`${profile.workspace_id}/`)) return { error: "Not authorized." };

  const admin = createServiceClient();
  const { data, error } = await admin.storage.from("client-reports").createSignedUrl(path, 60 * 10);
  if (error || !data) return { error: error?.message ?? "Could not create a download link." };
  return { url: data.signedUrl };
}
