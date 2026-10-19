import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRealRateLimit } from "@/lib/rate-limit";
import { hashIntakeToken, INTAKE_TOKEN_PREFIX } from "@/lib/leads/intake-token";
import { logIntakeEvent, processInbound } from "@/lib/leads/intake-process";
import { truthy } from "@/lib/leads/intake-normalize";

// Inbound lead webhook: a landing-page form, Zapier (fed by Apollo, Clay or
// anything else) or another tool POSTs one lead as JSON and a real `leads`
// row is created for the token's workspace.
//
//   POST /api/leads/inbound            [?dry_run=1  or  X-Dry-Run: 1]
//   Authorization: Bearer lci_...      (per-workspace token, see
//                                       /leadgen/connectors or /admin/campaigns)
//   { "campaign_id": "...", "phone": "+44...", "first_name": "...",
//     "consent": true, "consent_text": "I agree to be called..." }
//
// Common Apollo / Clay / Zapier field names are accepted (see
// src/lib/leads/intake-normalize.ts) and unknown fields are kept in
// `custom`. Responses: 201 created, 400 invalid, 401 bad token, 409 duplicate,
// 422 suppressed number, 429 rate limited. With dry_run nothing is saved and
// nothing is logged: the response says what would have happened.
//
// Every authenticated delivery (and bad tokens that match a workspace's
// token prefix) is recorded in lead_intake_events with the service role;
// only the last four digits of the phone number are kept.

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // Coarse per-IP limit first, so unauthenticated floods are cut off before
  // any database lookup of the token.
  if (!(await checkRealRateLimit("leads_inbound_ip", ip, 120, 3600))) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : (req.headers.get("x-lead-token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 401 });

  const admin = createServiceClient();
  const { data: tokenRow } = await admin
    .from("lead_intake_tokens")
    .select("id, workspace_id")
    .eq("token_hash", hashIntakeToken(token))
    .maybeSingle();
  if (!tokenRow) {
    // Attribute a bad attempt to a workspace only when the visible prefix of
    // the token matches that workspace's current token (so a wrong/rotated
    // token shows up in its own delivery log, while random noise does not).
    if (token.startsWith(INTAKE_TOKEN_PREFIX) && token.length >= 10) {
      const { data: owner } = await admin
        .from("lead_intake_tokens")
        .select("id, workspace_id")
        .eq("token_prefix", token.slice(0, 10))
        .maybeSingle();
      if (owner) {
        await logIntakeEvent(admin, {
          workspaceId: owner.workspace_id,
          tokenId: owner.id,
          source: null,
          status: 401,
          outcome: "unauthorized",
          error: "token did not match",
        });
      }
    }
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
  const workspaceId = tokenRow.workspace_id;

  // Per-workspace limit once authenticated.
  if (!(await checkRealRateLimit("leads_inbound_ws", workspaceId, 600, 3600))) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    await logIntakeEvent(admin, {
      workspaceId,
      tokenId: tokenRow.id,
      source: null,
      status: 400,
      outcome: "invalid",
      error: "body is not valid JSON",
    });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const dryRun = truthy(req.nextUrl.searchParams.get("dry_run")) || truthy(req.headers.get("x-dry-run"));
  const result = await processInbound({
    admin,
    workspaceId,
    raw,
    ip,
    dryRun,
    sourceHeader: req.headers.get("x-lead-source"),
  });

  if (!dryRun && !(result.body as { dry_run?: boolean }).dry_run) {
    await logIntakeEvent(admin, {
      workspaceId,
      tokenId: tokenRow.id,
      source: result.source,
      status: result.status,
      outcome: result.outcome,
      leadId: result.leadId,
      campaignId: result.campaignId,
      phoneLast4: result.phoneLast4,
      error: result.error,
    });
    if (result.outcome === "created") {
      await admin.from("lead_intake_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
    }
  }
  return NextResponse.json(result.body, { status: result.status });
}
