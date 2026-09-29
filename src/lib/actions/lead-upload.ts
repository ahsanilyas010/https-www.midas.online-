"use server";

import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { manualScreeningProvider } from "@/lib/compliance/screening";
import type { RealDatabase, RealTables } from "@/lib/supabase/real-types";

export interface LeadUploadState {
  error?: string;
  ok?: boolean;
  inserted?: number;
  deduped?: number;
}

// Same algorithm as compute_phone_hash() in
// supabase/migrations/00000000000047_leads_compliance_columns.sql
// (encode(digest(phone, 'sha256'), 'hex')) — computed here in Node so a
// large upload doesn't need one RPC round trip per row just to dedupe.
function phoneHash(phone: string): string {
  return createHash("sha256").update(phone).digest("hex");
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits.replace(/^0+/, "")}`;
}

// A small column mapper: looks for a header containing "phone"/"mobile"/
// "number", one containing "name", and one containing "email"; falls back
// to the first two columns for phone/name. Letting the admin pick which
// header maps to what is a later refinement — this gets a first batch
// usably in, which is what Phase 2 (and Phase 7's email send, which needs
// the email column) needs.
function mapRows(rows: Record<string, unknown>[]): { phone: string; name: string | null; email: string | null }[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const phoneKey = headers.find((h) => /phone|mobile|number/i.test(h)) ?? headers[0];
  const nameKey = headers.find((h) => /name/i.test(h)) ?? headers[1];
  const emailKey = headers.find((h) => /email/i.test(h));
  return rows
    .map((row) => {
      const phone = normalizePhone(String(row[phoneKey] ?? ""));
      const name = nameKey ? String(row[nameKey] ?? "").trim() || null : null;
      const email = emailKey ? String(row[emailKey] ?? "").trim() || null : null;
      return phone ? { phone, name, email } : null;
    })
    .filter((r): r is { phone: string; name: string | null; email: string | null } => r !== null);
}

interface IngestResult {
  batch: RealTables<"lead_batches">;
  inserted: number;
  deduped: number;
}

// Shared core: parses the file, dedupes against existing leads and the
// suppression list, and bulk-inserts. Used by both the standalone
// uploadLeadBatch() action below and the onboarding wizard's data step
// (src/lib/actions/onboarding.ts), so both ever behave identically.
export async function ingestLeadFile(
  supabase: SupabaseClient<RealDatabase>,
  workspaceId: string,
  uploadedBy: string,
  file: File,
  campaignId: string | null,
): Promise<IngestResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const mapped = mapRows(rows);
  if (mapped.length === 0) {
    throw new Error("No usable rows found — check the file has a phone number column.");
  }

  const path = `${workspaceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage
    .from("lead-uploads")
    .upload(path, buffer, { contentType: file.type || "text/csv" });
  if (uploadError) throw new Error(uploadError.message);

  const { data: batch, error: batchError } = await supabase
    .from("lead_batches")
    .insert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      source: file.name,
      uploaded_by: uploadedBy,
      row_count: mapped.length,
      status: "processing",
      storage_path: path,
    })
    .select("*")
    .single();
  if (batchError || !batch) throw new Error(batchError?.message ?? "Could not create the batch.");

  const withHash = mapped.map((r) => ({ ...r, hash: phoneHash(r.phone) }));
  const uniqueHashes = [...new Set(withHash.map((r) => r.hash))];

  const [{ data: existingLeads }, { data: suppressed }] = await Promise.all([
    supabase.from("leads").select("phone_hash").eq("workspace_id", workspaceId).in("phone_hash", uniqueHashes),
    supabase.from("suppression_list").select("phone_hash").eq("workspace_id", workspaceId).in("phone_hash", uniqueHashes),
  ]);
  const skip = new Set([
    ...(existingLeads ?? []).map((r) => r.phone_hash).filter((h): h is string => Boolean(h)),
    ...(suppressed ?? []).map((r) => r.phone_hash),
  ]);

  // Also dedupe within the file itself (repeated numbers in one upload).
  const seenInFile = new Set<string>();
  const toInsert = withHash.filter((r) => {
    if (skip.has(r.hash) || seenInFile.has(r.hash)) return false;
    seenInFile.add(r.hash);
    return true;
  });
  const deduped = withHash.length - toInsert.length;

  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500).map((r) => ({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      batch_id: batch.id,
      phone_e164: r.phone,
      full_name: r.name,
      email: r.email,
    }));
    const { error } = await supabase.from("leads").insert(chunk);
    if (error) throw new Error(error.message);
  }

  const { data: updatedBatch } = await supabase
    .from("lead_batches")
    .update({ row_count: toInsert.length, status: "uploaded" })
    .eq("id", batch.id)
    .select("*")
    .single();

  return { batch: updatedBatch ?? batch, inserted: toInsert.length, deduped };
}

export async function uploadLeadBatch(_prev: LeadUploadState, formData: FormData): Promise<LeadUploadState> {
  const profile = await requireRealProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) {
    return { error: "Only an admin or team lead can upload leads." };
  }
  const workspace = await getCurrentWorkspace();

  const file = formData.get("file");
  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file." };

  const supabase = await createRealClient();
  try {
    const { inserted, deduped } = await ingestLeadFile(supabase, workspace.id, profile.id, file, campaignId);
    return { ok: true, inserted, deduped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not process the upload." };
  }
}

export async function screenLeadBatch(batchId: string): Promise<{ error?: string; screenedCount?: number }> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can screen a batch." };
  }
  const supabase = await createRealClient();
  try {
    const { screenedCount } = await manualScreeningProvider.screenBatch(supabase, { batchId, evidenceUrl: null });
    return { screenedCount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not screen the batch." };
  }
}
