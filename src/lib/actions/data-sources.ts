"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { getConnector, connectorRegistry } from "@/lib/connectors/registry";
import { importLeads } from "@/lib/connectors/pipeline";
import { parseVendorFile, normaliseVendorRow, type VendorCsvFieldMap } from "@/lib/connectors/vendor-csv";
import { captureException } from "@/lib/error-tracking";
import type { Json } from "@/lib/supabase/types";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  imported?: number;
  rejected?: number;
  assigned?: number;
}

// Resolves who a direct-to-agent upload's leads go to, before anything is
// imported — a team with no active agents fails the whole upload up
// front rather than leaving a just-committed batch stranded unassigned
// with no clean way to signal "the import worked but the assignment
// didn't."
async function resolveAssignmentTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignToAgentId: string | null,
  assignToTeamId: string | null,
): Promise<{ agentIds: string[] | null; error?: string }> {
  if (!assignToAgentId && !assignToTeamId) return { agentIds: null };
  if (assignToAgentId) return { agentIds: [assignToAgentId] };

  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .eq("team_id", assignToTeamId!)
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name");
  const agentIds = (members ?? []).map((m) => m.id);
  if (agentIds.length === 0) {
    return { agentIds: null, error: "That team has no active agents to assign to." };
  }
  return { agentIds };
}

// Direct-to-agent upload — skips the manual "Assign to..." step by tagging
// every lead this run imports with an agent (or, for a team, round-robining
// across the agentIds resolveAssignmentTargets found) right away, and
// marks them screened immediately so there's no "Unassigned"/"unscreened"
// gap for the agent to wait through. Only ever called for leads this exact
// run just inserted (outcome.insertedIds) — never touches anyone else's
// leads, and never touches a lead importLeads() already suppressed
// (do_not_call=true stays blocked regardless of this flow).
async function assignImportedLeads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  insertedIds: string[],
  agentIds: string[],
): Promise<number> {
  if (insertedIds.length === 0 || agentIds.length === 0) return 0;

  // Screening first: assignment below only picks up leads that are now
  // 'passed', same gate the manual dropdown uses. do_not_call=false is
  // enough to exclude a suppression-list hit — importLeads() only ever
  // sets do_not_call=true together with screening_status='blocked'.
  await supabase
    .from("leads")
    .update({ screening_status: "passed", screened_at: new Date().toISOString() })
    .in("id", insertedIds)
    .eq("do_not_call", false);

  const { data: assignable } = await supabase
    .from("leads")
    .select("id")
    .in("id", insertedIds)
    .eq("do_not_call", false)
    .eq("screening_status", "passed")
    .order("created_at");

  const nowIso = new Date().toISOString();
  const results = await Promise.all(
    (assignable ?? []).map((lead, i) =>
      supabase
        .from("leads")
        .update({ assigned_to: agentIds[i % agentIds.length], assigned_at: nowIso, status: "assigned" })
        .eq("id", lead.id),
    ),
  );

  return results.filter((r) => !r.error).length;
}

// Registers a data_source row backed by one of the built-in connectors.
// `config.connector_key` is how the admin/data screen knows which
// connector's "Run fetch" dialog to offer for this source.
export async function registerConnectorSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager"].includes(profile.role)) return { error: "Not authorized." };

  const connectorKey = String(formData.get("connector_key") ?? "");
  const connector = connectorRegistry[connectorKey];
  if (!connector) return { error: "Unknown connector." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("data_sources").insert({
    name,
    source_type: connector.market === "UK" && connectorKey === "companies_house" ? "public_api" : "public_open_data",
    market: connector.market,
    lawful_basis: connector.lawfulBasis,
    config: { connector_key: connectorKey } as Json,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true };
}

// Section 6.4 — triggers one of the registered API/open-data connectors.
// Runs the whole fetch -> normalise -> import cycle and records it in
// source_fetch_runs regardless of outcome, so a failed run is as visible
// as a successful one.
export async function runConnectorFetch(params: {
  connectorKey: string;
  dataSourceId: string;
  campaignId: string;
  fetchParams: Record<string, unknown>;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) {
    return { error: "Not authorized." };
  }

  const connector = getConnector(params.connectorKey);
  if (!connector) return { error: `Unknown connector "${params.connectorKey}".` };

  const supabase = await createClient();
  const { data: run, error: runError } = await supabase
    .from("source_fetch_runs")
    .insert({
      data_source_id: params.dataSourceId,
      campaign_id: params.campaignId,
      triggered_by: profile.id,
      params: params.fetchParams as Json,
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !run) return { error: runError?.message ?? "Could not start fetch run." };

  try {
    const raw = await connector.fetch(params.fetchParams);
    const records = raw.map((r) => connector.normalise(r)).filter((r) => r !== null);

    const outcome = await importLeads({
      supabase,
      campaignId: params.campaignId,
      dataSourceId: params.dataSourceId,
      records,
    });

    await supabase
      .from("source_fetch_runs")
      .update({
        finished_at: new Date().toISOString(),
        records_found: raw.length,
        records_imported: outcome.imported,
        records_rejected: raw.length - records.length + outcome.rejected,
        status: "complete",
      })
      .eq("id", run.id);

    revalidatePath("/admin/data");
    return { ok: true, imported: outcome.imported, rejected: outcome.rejected };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed.";
    captureException(err, { action: "runConnectorFetch", dataSourceId: params.dataSourceId, runId: run.id });
    await supabase
      .from("source_fetch_runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error: message })
      .eq("id", run.id);
    revalidatePath("/admin/data");
    return { error: message };
  }
}

// Section 6.4 — "Vendor CSV | Both | Licensed | Generic import path with
// mandatory provenance capture." Same commit path as the API connectors;
// logged the same way in source_fetch_runs so import history is one list,
// not two.
export async function uploadVendorCsv(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) {
    return { error: "Not authorized." };
  }

  const campaignId = String(formData.get("campaign_id") ?? "");
  const dataSourceId = String(formData.get("data_source_id") ?? "");
  const countryHint = String(formData.get("country") ?? "GB");
  const file = formData.get("file");
  const assignToAgentId = String(formData.get("assign_to_agent_id") ?? "") || null;
  const assignToTeamId = String(formData.get("assign_to_team_id") ?? "") || null;

  if (!campaignId || !dataSourceId || !(file instanceof File)) {
    return { error: "Campaign, data source and a file are required." };
  }

  const supabase = await createClient();
  const { agentIds, error: assignmentError } = await resolveAssignmentTargets(
    supabase,
    assignToAgentId,
    assignToTeamId,
  );
  if (assignmentError) return { error: assignmentError };

  const fieldMap: VendorCsvFieldMap = {
    phone: String(formData.get("map_phone") ?? "") || undefined,
    firstName: String(formData.get("map_first_name") ?? "") || undefined,
    lastName: String(formData.get("map_last_name") ?? "") || undefined,
    companyName: String(formData.get("map_company_name") ?? "") || undefined,
    jobTitle: String(formData.get("map_job_title") ?? "") || undefined,
    email: String(formData.get("map_email") ?? "") || undefined,
    addressLine1: String(formData.get("map_address") ?? "") || undefined,
    city: String(formData.get("map_city") ?? "") || undefined,
    region: String(formData.get("map_region") ?? "") || undefined,
    postcode: String(formData.get("map_postcode") ?? "") || undefined,
    externalRef: String(formData.get("map_external_ref") ?? "") || undefined,
    council: String(formData.get("map_council") ?? "") || undefined,
    projectName: String(formData.get("map_project_name") ?? "") || undefined,
    projectType: String(formData.get("map_project_type") ?? "") || undefined,
    units: String(formData.get("map_units") ?? "") || undefined,
    summary: String(formData.get("map_summary") ?? "") || undefined,
    decision: String(formData.get("map_decision") ?? "") || undefined,
    decisionDate: String(formData.get("map_decision_date") ?? "") || undefined,
    contactNameAddress: String(formData.get("map_contact_name_address") ?? "") || undefined,
    portalUrl: String(formData.get("map_portal_url") ?? "") || undefined,
    sourceNotes: String(formData.get("map_source_notes") ?? "") || undefined,
    applicationDate: String(formData.get("map_application_date") ?? "") || undefined,
    authority: String(formData.get("map_authority") ?? "") || undefined,
    category: String(formData.get("map_category") ?? "") || undefined,
    applicationType: String(formData.get("map_application_type") ?? "") || undefined,
    proposal: String(formData.get("map_proposal") ?? "") || undefined,
    architectName: String(formData.get("map_architect_name") ?? "") || undefined,
    web: String(formData.get("map_web") ?? "") || undefined,
    contact: String(formData.get("map_contact") ?? "") || undefined,
    comments: String(formData.get("map_comments") ?? "") || undefined,
    disposition: String(formData.get("map_disposition") ?? "") || undefined,
  };
  if (!fieldMap.phone) return { error: "A phone-number column mapping is required." };

  const { data: run, error: runError } = await supabase
    .from("source_fetch_runs")
    .insert({
      data_source_id: dataSourceId,
      campaign_id: campaignId,
      triggered_by: profile.id,
      params: { fieldMap, filename: file.name } as Json,
      status: "running",
      assigned_to: assignToAgentId,
      assigned_team_id: assignToTeamId,
      skip_screening: agentIds !== null,
    })
    .select("id")
    .single();
  if (runError || !run) return { error: runError?.message ?? "Could not start import run." };

  try {
    const { rows } = parseVendorFile(await file.arrayBuffer());
    const records = rows
      .map((row) => normaliseVendorRow(row, fieldMap, countryHint))
      .filter((r) => r !== null);

    const outcome = await importLeads({
      supabase,
      campaignId,
      dataSourceId,
      records,
    });

    const assigned = agentIds ? await assignImportedLeads(supabase, outcome.insertedIds, agentIds) : 0;

    await supabase
      .from("source_fetch_runs")
      .update({
        finished_at: new Date().toISOString(),
        records_found: rows.length,
        records_imported: outcome.imported,
        records_rejected: rows.length - records.length + outcome.rejected,
        status: "complete",
      })
      .eq("id", run.id);

    revalidatePath("/admin/data");
    revalidatePath("/agent");
    return { ok: true, imported: outcome.imported, rejected: outcome.rejected, assigned };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    captureException(err, { action: "uploadVendorCsv", dataSourceId, runId: run.id });
    await supabase
      .from("source_fetch_runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error: message })
      .eq("id", run.id);
    revalidatePath("/admin/data");
    return { error: message };
  }
}
