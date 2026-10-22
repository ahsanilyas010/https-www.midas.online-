"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { captureException } from "@/lib/error-tracking";
import {
  ImportError,
  buildPlan,
  loadCampaigns,
  parseTabular,
  runMappedImport,
  type ImportContext,
} from "@/lib/leads/mapped-import";
import { IMPORT_LIMITS, type ColumnMapping, type ImportPreview, type ImportResult } from "@/lib/leads/mapped-import-shared";

// Server side of the mapped lead importer (src/lib/leads/mapped-import.ts).
// Two steps, both stateless: the review step (a dry run that saves nothing)
// and the import itself. Each call re-uploads the file and re-validates the
// mapping, so nothing the browser says about counts is ever trusted.

export type PreviewResponse = { error: string } | { ok: true; preview: ImportPreview };
export type ImportResponse =
  | { error: string }
  | { ok: true; result: ImportResult; campaignName: string; sourceName: string | null };

const IMPORTERS = ["super_admin", "ops_manager", "lead_gen"];
const uuid = z.string().uuid();

async function prepare(formData: FormData) {
  const profile = await requireRealProfile();
  if (!IMPORTERS.includes(profile.role)) throw new ImportError("Only an admin, ops manager or lead gen can import leads.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("Choose a CSV or Excel file.");
  if (file.size > IMPORT_LIMITS.maxBytes) throw new ImportError("That file is larger than 10 MB. Split it and import the parts one at a time.");

  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!uuid.safeParse(campaignId).success) throw new ImportError("Choose the campaign these leads belong to.");

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as ColumnMapping;
  } catch {
    throw new ImportError("The column mapping was not understood. Go back and map the columns again.");
  }

  const supabase = await createRealClient();
  const ctx: ImportContext = { supabase, workspaceId: profile.workspace_id, userId: profile.id, role: profile.role };
  const campaigns = await loadCampaigns(ctx);
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new ImportError("Campaign not found.");
  // Dates with no timezone are read in the campaign's timezone (managers can
  // read it; lead gen cannot, so theirs fall back to UTC).
  const { data: tzRow } = await supabase.from("campaigns").select("timezone").eq("id", campaignId).maybeSingle();
  const timezone = tzRow?.timezone ?? null;

  // EVERY import names a data source, and a data source carries the lawful
  // basis the list is held under. This is enforced here (and again by the
  // database: migration 108), never only by the form, so no list can be loaded
  // without a recorded basis.
  const dataSourceId = String(formData.get("data_source_id") ?? "");
  if (!dataSourceId) throw new ImportError("Choose the data source for this list.");
  if (!uuid.safeParse(dataSourceId).success) throw new ImportError("Choose the data source for this list.");
  const { data: sourceRow } = await supabase
    .from("data_sources")
    .select("id, name, lawful_basis, is_active")
    .eq("id", dataSourceId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!sourceRow) throw new ImportError("Data source not found.");
  if (!sourceRow.is_active) throw new ImportError("This data source is inactive.");
  // 'unspecified' only labels old uploads from before this rule; a list can't
  // be imported under it. Open the source and set the real basis first.
  if (!sourceRow.lawful_basis || sourceRow.lawful_basis === "unspecified") {
    throw new ImportError("This data source has no lawful basis on file yet. Open it under Data, set the real basis, then import.");
  }
  const source: { id: string; name: string } = { id: sourceRow.id, name: sourceRow.name };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parseTabular(bytes, file.name);
  return { profile, ctx, file, bytes, parsed, mapping, campaign, campaigns, timezone, source };
}

function fail(e: unknown, label: string): { error: string } {
  if (e instanceof ImportError) return { error: e.message };
  captureException(e, { action: label });
  return { error: "Something went wrong reading that file. Please try again." };
}

export async function previewLeadImport(formData: FormData): Promise<PreviewResponse> {
  try {
    const { ctx, parsed, mapping, campaign, campaigns, timezone } = await prepare(formData);
    const plan = await buildPlan(ctx, {
      parsed,
      mapping,
      campaigns,
      defaultCampaignId: campaign.id,
      timezone,
      holdPhoneless: true,
    });
    return { ok: true, preview: plan.preview };
  } catch (e) {
    return fail(e, "previewLeadImport");
  }
}

export async function runLeadImport(formData: FormData): Promise<ImportResponse> {
  try {
    const { profile, ctx, file, bytes, parsed, mapping, campaign, campaigns, timezone, source } = await prepare(formData);
    const callMyself = formData.get("call_myself") === "1";
    const screenNow = formData.get("screen_now") === "1";

    const out = await runMappedImport(ctx, {
      parsed,
      mapping,
      campaigns,
      defaultCampaignId: campaign.id,
      timezone,
      holdPhoneless: true,
      filename: file.name,
      fileBytes: bytes,
      contentType: file.type,
      dataSourceId: source.id,
      batchLabel: `${source.name}: ${file.name}`,
      callMyself,
      screenNow,
    });

    // Every import keeps a provenance run (shown under Data > Import history),
    // and rows with a name or email but no number are held as contacts to be
    // promoted later.
    const supabase = ctx.supabase;
    const { data: run } = await supabase
      .from("source_fetch_runs")
      .insert({
        workspace_id: profile.workspace_id,
        data_source_id: source.id,
        campaign_id: campaign.id,
        triggered_by: profile.id,
        params: { filename: file.name, mapping, country: out.preview.country } as never,
        records_found: out.preview.totalRows,
        records_imported: out.imported,
        records_rejected:
          out.skippedInvalid + out.skippedDuplicates + out.skippedExisting + out.skippedSuppressed + out.skippedUnknownCampaign,
        records_unphoned: out.phonelessHeld,
        batch_id: out.batchId || null,
        finished_at: new Date().toISOString(),
        status: "complete",
      })
      .select("id")
      .single();
    if (out.phonelessRows.length > 0) {
      for (let i = 0; i < out.phonelessRows.length; i += 500) {
        await supabase.from("unphoned_contacts").insert(
          out.phonelessRows.slice(i, i + 500).map((p) => ({
            workspace_id: profile.workspace_id,
            campaign_id: p.campaignId,
            data_source_id: source.id,
            run_id: run?.id ?? null,
            full_name: p.name,
            email: p.email,
            company_name: p.company,
            custom: p.custom,
            country_hint: p.region,
            // "I will call these myself" covers the phone-less rows too.
            assigned_to: callMyself ? profile.id : null,
          })),
        );
      }
    }

    revalidatePath("/admin/import");
    revalidatePath("/admin/data");
    revalidatePath("/admin/compliance");
    revalidatePath("/admin/campaigns", "layout");
    revalidatePath("/leadgen", "layout");
    revalidatePath("/live");
    revalidatePath("/dial");

    const { phonelessRows: _p, preview: _v, ...result } = out;
    void _p;
    void _v;
    return { ok: true, result, campaignName: campaign.name, sourceName: source.name };
  } catch (e) {
    return fail(e, "runLeadImport");
  }
}
