"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { z } from "zod";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { captureException } from "@/lib/error-tracking";

export interface ActionResult {
  error?: string;
  ok?: boolean;
  imported?: number;
  rejected?: number;
  unphoned?: number;
}

const MANAGERS = ["super_admin", "ops_manager"];
// Lead gen registers sources and imports files too (RLS limits it to inserting
// its own sources / batches / runs; it cannot edit or deactivate a source).
const IMPORTERS = ["super_admin", "ops_manager", "lead_gen"];

const SOURCE_TYPES = [
  "client_supplied",
  "vendor_licensed",
  "public_open_data",
  "inbound_web_form",
  "referral",
  "manual_entry",
] as const;
const LAWFUL_BASES = ["consent", "legitimate_interest", "contract", "not_personal_data"] as const;

const sourceSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(120),
  source_type: z.enum(SOURCE_TYPES),
  lawful_basis: z.enum(LAWFUL_BASES, { message: "A lawful basis is required." }),
  market: z.string().trim().max(20).optional(),
  provider_url: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function registerDataSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!IMPORTERS.includes(profile.role)) return { error: "Only an admin or lead gen can register data sources." };

  const parsed = sourceSchema.safeParse({
    name: formData.get("name"),
    source_type: formData.get("source_type"),
    lawful_basis: formData.get("lawful_basis"),
    market: formData.get("market") || undefined,
    provider_url: formData.get("provider_url") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createRealClient();
  const { error } = await supabase.from("data_sources").insert({
    workspace_id: profile.workspace_id,
    name: parsed.data.name,
    source_type: parsed.data.source_type,
    lawful_basis: parsed.data.lawful_basis,
    market: parsed.data.market ?? null,
    provider_url: parsed.data.provider_url ?? null,
    notes: parsed.data.notes ?? null,
    created_by: profile.id,
  });
  if (error) return { error: error.code === "23505" ? "A source with that name already exists." : error.message };
  revalidatePath("/admin/data");
  revalidatePath("/leadgen/leads");
  return { ok: true };
}

export async function setDataSourceActive(id: string, active: boolean): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role)) return { error: "Only an admin can change data sources." };
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("data_sources")
    .update({ is_active: active })
    .eq("id", id)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true };
}

// Same algorithm as compute_phone_hash() (migration 047).
function phoneHash(e164: string): string {
  return createHash("sha256").update(e164).digest("hex");
}

function cell(row: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const v = row[key];
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

// Section 6.4: a vendor/client file import with mandatory provenance. Every
// lead gets a data_source_id (and the batch records it too); rows without a
// usable phone but with a name or email land in unphoned_contacts instead of
// being fabricated or silently dropped. Dedupe against existing leads and
// the suppression list mirrors ingestLeadFile() in lead-upload.ts.
export async function importVendorFile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!IMPORTERS.includes(profile.role)) return { error: "Only an admin or lead gen can import leads." };
  const isLeadGen = profile.role === "lead_gen";

  const dataSourceId = String(formData.get("data_source_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "") || null;
  const country = (String(formData.get("country") ?? "GB").trim() || "GB").toUpperCase();
  const file = formData.get("file");
  const map = {
    phone: String(formData.get("map_phone") ?? "") || undefined,
    name: String(formData.get("map_name") ?? "") || undefined,
    first: String(formData.get("map_first_name") ?? "") || undefined,
    last: String(formData.get("map_last_name") ?? "") || undefined,
    email: String(formData.get("map_email") ?? "") || undefined,
    ref: String(formData.get("map_external_ref") ?? "") || undefined,
  };

  if (!z.string().uuid().safeParse(dataSourceId).success) return { error: "Pick a data source." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or XLSX file." };
  if (!map.phone) return { error: "A phone-number column mapping is required." };

  const supabase = await createRealClient();
  const ws = profile.workspace_id;

  const { data: source } = await supabase
    .from("data_sources")
    .select("id, name, lawful_basis, is_active")
    .eq("id", dataSourceId)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!source) return { error: "Data source not found." };
  if (!source.lawful_basis) return { error: "No lawful basis on file for this data source: refusing to import." };
  if (!source.is_active) return { error: "This data source is inactive." };

  if (campaignId) {
    if (isLeadGen) {
      // lead_gen has no direct read on campaigns: use the name-only pick-list.
      const { data: list } = await supabase.rpc("leadgen_campaigns");
      if (!(list ?? []).some((c) => c.id === campaignId)) return { error: "Campaign not found." };
    } else {
      const { data: camp } = await supabase.from("campaigns").select("id").eq("id", campaignId).eq("workspace_id", ws).maybeSingle();
      if (!camp) return { error: "Campaign not found." };
    }
  }

  let buffer: Buffer;
  let rows: Record<string, unknown>[];
  try {
    buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
  } catch {
    return { error: "Could not parse the uploaded file." };
  }
  if (rows.length === 0) return { error: "The file has no rows." };

  const { data: run, error: runError } = await supabase
    .from("source_fetch_runs")
    .insert({
      workspace_id: ws,
      data_source_id: dataSourceId,
      campaign_id: campaignId,
      triggered_by: profile.id,
      params: { filename: file.name, mapping: map, country },
      records_found: rows.length,
      status: "running",
    })
    .select("id")
    .single();
  if (runError || !run) return { error: runError?.message ?? "Could not start the import run." };

  const fail = async (message: string): Promise<ActionResult> => {
    await supabase
      .from("source_fetch_runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error: message })
      .eq("id", run.id);
    revalidatePath("/admin/data");
    revalidatePath("/leadgen", "layout");
    return { error: message };
  };

  try {
    type Parsed = { phone: string; hash: string; name: string | null; email: string | null };
    const good: Parsed[] = [];
    const phoneless: { name: string | null; email: string | null; ref: string | null }[] = [];
    let invalid = 0;

    for (const row of rows) {
      const name =
        cell(row, map.name) ?? ([cell(row, map.first), cell(row, map.last)].filter(Boolean).join(" ") || undefined);
      const email = cell(row, map.email);
      const raw = cell(row, map.phone);
      if (!raw) {
        if (name || email) phoneless.push({ name: name ?? null, email: email ?? null, ref: cell(row, map.ref) ?? null });
        else invalid += 1;
        continue;
      }
      try {
        const p = parsePhoneNumberWithError(raw, country as never);
        if (!p.isPossible()) throw new Error("invalid");
        good.push({ phone: p.number, hash: phoneHash(p.number), name: name ?? null, email: email ?? null });
      } catch {
        invalid += 1;
      }
    }

    // Dedupe: within the file, against existing leads, and against suppression.
    const hashes = [...new Set(good.map((g) => g.hash))];
    const skip = new Set<string>();
    for (let i = 0; i < hashes.length; i += 300) {
      const chunk = hashes.slice(i, i + 300);
      if (isLeadGen) {
        // lead_gen can only read a slice of leads and no suppression list, so
        // the workspace-wide check goes through a hashes-only RPC.
        const { data: known, error: knownErr } = await supabase.rpc("leadgen_known_hashes", { p_hashes: chunk });
        if (knownErr) return fail(knownErr.message);
        for (const r of known ?? []) if (r.phone_hash) skip.add(r.phone_hash);
        continue;
      }
      const [{ data: existing }, { data: sup }] = await Promise.all([
        supabase.from("leads").select("phone_hash").eq("workspace_id", ws).in("phone_hash", chunk),
        supabase.from("suppression_list").select("phone_hash").eq("workspace_id", ws).in("phone_hash", chunk),
      ]);
      for (const r of existing ?? []) if (r.phone_hash) skip.add(r.phone_hash);
      for (const r of sup ?? []) skip.add(r.phone_hash);
    }
    const seen = new Set<string>();
    const toInsert = good.filter((g) => {
      if (skip.has(g.hash) || seen.has(g.hash)) return false;
      seen.add(g.hash);
      return true;
    });
    const duplicates = good.length - toInsert.length;

    // Batch row (+ the raw file, same bucket/path convention as lead-upload.ts).
    let batchId: string | null = null;
    if (toInsert.length > 0) {
      const path = `${ws}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("lead-uploads")
        .upload(path, buffer, { contentType: file.type || "text/csv" });
      if (upErr) return fail(`Could not store the file: ${upErr.message}`);

      const { data: batch, error: batchErr } = await supabase
        .from("lead_batches")
        .insert({
          workspace_id: ws,
          campaign_id: campaignId,
          data_source_id: dataSourceId,
          source: `${source.name}: ${file.name}`,
          uploaded_by: profile.id,
          row_count: toInsert.length,
          status: "uploaded",
          storage_path: path,
        })
        .select("id")
        .single();
      if (batchErr || !batch) return fail(batchErr?.message ?? "Could not create the batch.");
      batchId = batch.id;

      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500).map((r) => ({
          workspace_id: ws,
          campaign_id: campaignId,
          batch_id: batch.id,
          data_source_id: dataSourceId,
          phone_e164: r.phone,
          full_name: r.name,
          email: r.email,
        }));
        const { error } = await supabase.from("leads").insert(chunk);
        if (error) return fail(error.message);
      }
    }

    // Phone-less contacts: skip refs already held for this source.
    let unphonedInserted = 0;
    if (phoneless.length > 0) {
      const refs = phoneless.map((p) => p.ref).filter((r): r is string => Boolean(r));
      const have = new Set<string>();
      if (refs.length > 0) {
        const { data: existing } = await supabase
          .from("unphoned_contacts")
          .select("external_ref")
          .eq("workspace_id", ws)
          .eq("data_source_id", dataSourceId)
          .in("external_ref", refs);
        for (const e of existing ?? []) if (e.external_ref) have.add(e.external_ref);
      }
      const seenRefs = new Set<string>();
      const fresh = phoneless.filter((p) => {
        if (!p.ref) return true;
        if (have.has(p.ref) || seenRefs.has(p.ref)) return false;
        seenRefs.add(p.ref);
        return true;
      });
      const rowFor = (p: (typeof fresh)[number]) => ({
        workspace_id: ws,
        campaign_id: campaignId,
        data_source_id: dataSourceId,
        run_id: run.id,
        external_ref: p.ref,
        full_name: p.name,
        email: p.email,
        country_hint: country,
      });
      for (let i = 0; i < fresh.length; i += 500) {
        const slice = fresh.slice(i, i + 500);
        const { error } = await supabase.from("unphoned_contacts").insert(slice.map(rowFor));
        if (!error) {
          unphonedInserted += slice.length;
          continue;
        }
        if (error.code !== "23505") return fail(error.message);
        // A ref we could not see (held by another user) clashed: fall back to
        // row-by-row and skip just the clashing ones.
        for (const p of slice) {
          const { error: rowErr } = await supabase.from("unphoned_contacts").insert(rowFor(p));
          if (!rowErr) unphonedInserted += 1;
          else if (rowErr.code !== "23505") return fail(rowErr.message);
        }
      }
    }

    const rejected = invalid + duplicates;
    await supabase
      .from("source_fetch_runs")
      .update({
        finished_at: new Date().toISOString(),
        batch_id: batchId,
        records_imported: toInsert.length,
        records_rejected: rejected,
        records_unphoned: unphonedInserted,
        status: "complete",
      })
      .eq("id", run.id);

    revalidatePath("/admin/data");
    revalidatePath("/admin/settings/leads");
    revalidatePath("/leadgen", "layout");
    return { ok: true, imported: toInsert.length, rejected, unphoned: unphonedInserted };
  } catch (err) {
    captureException(err, { action: "importVendorFile", dataSourceId, runId: run.id });
    return fail(err instanceof Error ? err.message : "Import failed.");
  }
}

export async function assignUnphonedContact(contactId: string, agentId: string | null): Promise<ActionResult> {
  const profile = await requireRealProfile();
  if (!MANAGERS.includes(profile.role)) return { error: "Only an admin can assign contacts." };
  const supabase = await createRealClient();
  if (agentId) {
    const { data: a } = await supabase.from("profiles").select("id").eq("id", agentId).eq("workspace_id", profile.workspace_id).maybeSingle();
    if (!a) return { error: "Agent not found." };
  }
  const { error } = await supabase
    .from("unphoned_contacts")
    .update({ assigned_to: agentId })
    .eq("id", contactId)
    .eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true };
}

// Turns a phone-less contact into a real lead. promote_unphoned_contact()
// (migration 075) re-checks authorisation, the suppression list and
// duplicates itself, since it runs as SECURITY DEFINER.
export async function promoteContact(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireRealProfile();
  const contactId = String(formData.get("contact_id") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!z.string().uuid().safeParse(contactId).success) return { error: "Missing contact." };
  if (!phoneRaw) return { error: "Enter a phone number." };

  const supabase = await createRealClient();
  const { data: contact } = await supabase
    .from("unphoned_contacts")
    .select("id, country_hint, promoted_lead_id")
    .eq("id", contactId)
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();
  if (!contact) return { error: "Contact not found, or it isn't assigned to you." };
  if (contact.promoted_lead_id) return { error: "This contact has already been queued as a lead." };

  let e164: string;
  try {
    const p = parsePhoneNumberWithError(phoneRaw, contact.country_hint as never);
    if (!p.isPossible()) throw new Error("invalid");
    e164 = p.number;
  } catch {
    return { error: `"${phoneRaw}" doesn't parse as a valid phone number.` };
  }

  const { error } = await supabase.rpc("promote_unphoned_contact", {
    p_contact_id: contactId,
    p_phone_e164: e164,
    p_phone_raw: phoneRaw,
  });
  if (error) {
    if (error.code === "23505") return { error: "That phone number already exists as a lead." };
    return { error: error.message };
  }
  revalidatePath("/admin/data");
  return { ok: true };
}
