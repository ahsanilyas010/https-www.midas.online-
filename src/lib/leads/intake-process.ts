import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase, RealJson } from "@/lib/supabase/real-types";
import { countryToRegion } from "@/lib/campaign-options";
import { captureException } from "@/lib/error-tracking";
import { maskPhone, normalizeInbound, phoneLast4, resolveCountry } from "@/lib/leads/intake-normalize";

// The shared brain of the inbound lead webhook: POST /api/leads/inbound and
// the "Test payload" dry run on /leadgen/connectors both call this, so what
// the dry run reports is exactly what a real delivery would do. There is no
// Supabase session on the webhook, so every check RLS would normally give
// (workspace scoping, campaign ownership, suppression, duplicates) is done
// here with the service client, always filtered by the token's workspace.
// Leads are inserted with screening_status = 'pending' (phone_hash comes from
// the database trigger): not dialable until a manager screens them.

type Admin = SupabaseClient<RealDatabase>;

export type IntakeOutcome = "created" | "duplicate" | "suppressed" | "invalid" | "error";

export interface IntakeResult {
  status: number;
  body: Record<string, unknown>;
  outcome: IntakeOutcome;
  source: string;
  leadId?: string;
  campaignId?: string;
  phoneLast4?: string | null;
  // Message for the delivery log (never contains a phone number).
  error?: string;
}

const emailSchema = z.string().email().max(200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string, source: string, extra: Partial<IntakeResult> = {}): IntakeResult {
  return { status: 400, body: { error: message }, outcome: "invalid", source, error: message, ...extra };
}

export async function processInbound(opts: {
  admin: Admin;
  workspaceId: string;
  raw: unknown;
  ip: string;
  dryRun: boolean;
  // Optional X-Lead-Source header; the body's `source` wins when present.
  sourceHeader?: string | null;
}): Promise<IntakeResult> {
  const { admin, workspaceId, ip } = opts;

  if (!opts.raw || typeof opts.raw !== "object" || Array.isArray(opts.raw)) {
    return bad("Body must be a JSON object.", "webhook");
  }
  const n = normalizeInbound(opts.raw as Record<string, unknown>);
  const f = n.fields;
  const header = normalizeInbound({ source: opts.sourceHeader ?? undefined }).fields.source;
  const source = f.source ?? header ?? "webhook";
  const dryRun = opts.dryRun || n.dryRun;

  if (n.honeypot) {
    // Bot trap filled: drop silently, but still tell the log.
    return { status: 200, body: { ok: true }, outcome: "invalid", source, error: "honeypot field filled" };
  }

  const dry = (r: IntakeResult): IntakeResult => {
    if (!dryRun) return r;
    return {
      ...r,
      status: r.outcome === "created" ? 200 : r.status,
      body: {
        ok: r.outcome === "created",
        dry_run: true,
        would: r.outcome,
        would_status: r.status,
        ...(r.outcome === "created" ? { message: "Valid. Nothing was saved (dry run)." } : { error: r.error }),
        source,
        mapped_fields: n.mapped,
        custom_fields: n.unmapped,
        lead: {
          first_name: f.first_name ?? null,
          last_name: f.last_name ?? null,
          email: f.email ?? null,
          company_name: f.company_name ?? null,
          job_title: f.job_title ?? null,
          phone: maskPhone(f.phone),
          city: f.city ?? null,
          region: f.region ?? null,
          country: f.country ?? null,
        },
      },
    };
  };

  if (f.consent !== true || !f.consent_text || f.consent_text.length < 5 || f.consent_text.length > 2000) {
    return dry(
      bad(
        "A consent confirmation (consent: true) and its exact text (consent_text) are required.",
        source,
        { phoneLast4: phoneLast4(f.phone) },
      ),
    );
  }
  if (!f.campaign) return dry(bad("campaign_id (or campaign / campaign_code) is required.", source, { phoneLast4: phoneLast4(f.phone) }));
  if (!f.phone || f.phone.length < 5 || f.phone.length > 40) {
    return dry(bad("A phone number is required (phone / mobile / phone_number / direct_phone).", source));
  }
  if (f.email && !emailSchema.safeParse(f.email).success) {
    return dry(bad("Invalid email.", source, { phoneLast4: phoneLast4(f.phone) }));
  }

  try {
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, name, code, country, status")
      .eq("workspace_id", workspaceId)
      .limit(500);
    const want = f.campaign.trim();
    const wl = want.toLowerCase();
    const campaign =
      (UUID.test(want) ? campaigns?.find((c) => c.id.toLowerCase() === wl) : undefined) ??
      campaigns?.find((c) => c.code && c.code.toLowerCase() === wl) ??
      campaigns?.find((c) => c.name.toLowerCase() === wl);
    if (!campaign || campaign.status === "archived") {
      return dry(bad("Unknown campaign.", source, { phoneLast4: phoneLast4(f.phone) }));
    }

    const country = resolveCountry(f.country);
    const region = countryToRegion(country || campaign.country);
    let phoneE164: string;
    try {
      const p = parsePhoneNumberWithError(f.phone, region as never);
      if (!p.isPossible()) throw new Error("invalid");
      phoneE164 = p.number;
    } catch {
      return dry(bad("Phone number is not valid.", source, { campaignId: campaign.id, phoneLast4: phoneLast4(f.phone) }));
    }
    const last4 = phoneLast4(phoneE164);

    const hash = createHash("sha256").update(phoneE164).digest("hex");
    const [{ data: suppressed }, { data: duplicate }] = await Promise.all([
      admin.from("suppression_list").select("id").eq("workspace_id", workspaceId).eq("phone_hash", hash).maybeSingle(),
      admin
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", campaign.id)
        .eq("phone_hash", hash)
        .limit(1)
        .maybeSingle(),
    ]);
    if (suppressed) {
      return dry({
        status: 422,
        body: { error: "This number can't be accepted." },
        outcome: "suppressed",
        source,
        campaignId: campaign.id,
        phoneLast4: last4,
        error: "number is on the suppression list",
      });
    }
    if (duplicate) {
      return dry({
        status: 409,
        body: { error: "This lead already exists in the campaign." },
        outcome: "duplicate",
        source,
        campaignId: campaign.id,
        phoneLast4: last4,
        error: "lead already exists in the campaign",
      });
    }

    if (dryRun) {
      return dry({ status: 201, body: {}, outcome: "created", source, campaignId: campaign.id, phoneLast4: last4 });
    }

    const custom: Record<string, RealJson> = {
      ...n.custom,
      ...(f.linkedin_url ? { linkedin_url: f.linkedin_url } : {}),
      consent_text: f.consent_text,
      consent_captured_at: new Date().toISOString(),
      submitted_ip: ip,
      intake_source: source,
    };

    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        phone_e164: phoneE164,
        first_name: f.first_name || null,
        last_name: f.last_name || null,
        company_name: f.company_name || null,
        job_title: f.job_title || null,
        email: f.email || null,
        address_line1: f.address_line1 || null,
        city: f.city || null,
        region: f.region || null,
        postcode: f.postcode || null,
        country_code: region,
        custom: custom as RealJson,
        source,
      })
      .select("id")
      .single();
    if (error || !lead) {
      captureException(error ?? new Error("lead insert returned no row"), { route: "/api/leads/inbound", workspaceId });
      return {
        status: 500,
        body: { error: "Could not accept this submission." },
        outcome: "error",
        source,
        campaignId: campaign.id,
        phoneLast4: last4,
        error: error?.message?.replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]") ?? "insert failed",
      };
    }
    return {
      status: 201,
      body: { ok: true, lead_id: lead.id },
      outcome: "created",
      source,
      leadId: lead.id,
      campaignId: campaign.id,
      phoneLast4: last4,
    };
  } catch (err) {
    captureException(err, { route: "/api/leads/inbound", workspaceId });
    return {
      status: 500,
      body: { error: "Could not accept this submission." },
      outcome: "error",
      source,
      error: "unexpected error",
    };
  }
}

export async function logIntakeEvent(
  admin: Admin,
  e: {
    workspaceId: string;
    tokenId?: string | null;
    source: string | null;
    status: number;
    outcome: IntakeOutcome | "unauthorized";
    leadId?: string | null;
    campaignId?: string | null;
    phoneLast4?: string | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("lead_intake_events").insert({
      workspace_id: e.workspaceId,
      token_id: e.tokenId ?? null,
      source: e.source,
      http_status: e.status,
      outcome: e.outcome,
      lead_id: e.leadId ?? null,
      campaign_id: e.campaignId ?? null,
      phone_last4: e.phoneLast4 && /^[0-9]{1,4}$/.test(e.phoneLast4) ? e.phoneLast4 : null,
      error: e.error ? e.error.slice(0, 300) : null,
    });
  } catch (err) {
    captureException(err, { route: "/api/leads/inbound", where: "logIntakeEvent" });
  }
}
