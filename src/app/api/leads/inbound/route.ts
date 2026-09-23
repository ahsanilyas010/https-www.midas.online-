import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { importLeads } from "@/lib/connectors/pipeline";
import type { NormalisedLead } from "@/lib/connectors/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/error-tracking";

// Section 6.4 — "Inbound web forms | Both | First-party consent | Highest
// value... Build the inbound web form connector properly — it is the
// highest-value item in this table." Public, unauthenticated endpoint for
// a landing-page consent form. RLS has no anon-insert policy for `leads`
// (unlike the unsubscribe endpoint's narrow anon path), so this route uses
// the service-role client — every check that RLS would normally provide is
// done here instead, before importLeads() runs the same validation/
// suppression/commit pipeline as every other source.

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit("leads_inbound", ip, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot: a hidden field real visitors never fill in.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true }); // pretend success, drop silently
  }

  const campaignId = String(body.campaign_id ?? "");
  const dataSourceId = String(body.data_source_id ?? "");
  const phone = String(body.phone ?? "").trim();
  const consent = body.consent === true;
  const consentText = String(body.consent_text ?? "").trim();
  const countryHint = String(body.country ?? "GB").toUpperCase();

  if (!campaignId || !dataSourceId || !phone) {
    return NextResponse.json({ error: "Campaign, data source and phone are required." }, { status: 400 });
  }
  if (!consent || !consentText) {
    return NextResponse.json(
      { error: "A consent confirmation and its exact text are required." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("id, source_type")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!dataSource || dataSource.source_type !== "inbound_web_form") {
    return NextResponse.json({ error: "Unknown or misconfigured form." }, { status: 400 });
  }

  const { data: campaign } = await supabase.from("campaigns").select("id").eq("id", campaignId).maybeSingle();
  if (!campaign) {
    return NextResponse.json({ error: "Unknown campaign." }, { status: 400 });
  }

  const submittedIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const record: NormalisedLead = {
    firstName: typeof body.first_name === "string" ? body.first_name.trim() || undefined : undefined,
    lastName: typeof body.last_name === "string" ? body.last_name.trim() || undefined : undefined,
    email: typeof body.email === "string" ? body.email.trim() || undefined : undefined,
    phoneRaw: phone,
    countryHint,
    city: typeof body.city === "string" ? body.city.trim() || undefined : undefined,
    postcode: typeof body.postcode === "string" ? body.postcode.trim() || undefined : undefined,
    consent: {
      status: "express_written",
      source: `web_form:${campaignId}`,
      capturedAt: new Date().toISOString(),
      text: consentText,
      submittedIp,
    },
  };

  try {
    const outcome = await importLeads({
      supabase,
      campaignId,
      dataSourceId,
      records: [record],
    });
    if (outcome.imported === 0) {
      return NextResponse.json(
        { error: outcome.rejections[0]?.reason ?? "Could not accept this submission." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { route: "/api/leads/inbound", campaignId, dataSourceId });
    return NextResponse.json({ error: "Could not accept this submission." }, { status: 500 });
  }
}
