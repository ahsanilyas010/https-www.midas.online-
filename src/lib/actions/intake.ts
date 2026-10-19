"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { generateIntakeToken } from "@/lib/leads/intake-token";
import { processInbound } from "@/lib/leads/intake-process";

export interface IntakeTokenResult {
  error?: string;
  token?: string;
}

// Admins and the lead-gen seat manage the inbound webhook.
const INTAKE_ROLES = ["super_admin", "ops_manager", "lead_gen"];

function refresh() {
  revalidatePath("/admin/campaigns", "layout");
  revalidatePath("/leadgen/connectors");
}

// Generates (or rotates) the workspace's inbound-lead webhook token. The
// plaintext is returned to the caller exactly once; only its hash is stored.
export async function rotateIntakeToken(): Promise<IntakeTokenResult> {
  const profile = await requireProfile();
  if (!INTAKE_ROLES.includes(profile.role)) {
    return { error: "Only an admin or lead gen can manage the inbound webhook." };
  }
  const { token, hash, prefix } = generateIntakeToken();
  const supabase = await createRealClient();
  const { error } = await supabase.from("lead_intake_tokens").upsert(
    {
      workspace_id: profile.workspace_id,
      token_hash: hash,
      token_prefix: prefix,
      created_by: profile.id,
      rotated_at: new Date().toISOString(),
      last_used_at: null,
    },
    { onConflict: "workspace_id" },
  );
  if (error) return { error: error.message };
  refresh();
  return { token };
}

export async function revokeIntakeToken(): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (!INTAKE_ROLES.includes(profile.role)) {
    return { error: "Only an admin or lead gen can manage the inbound webhook." };
  }
  const supabase = await createRealClient();
  const { error } = await supabase.from("lead_intake_tokens").delete().eq("workspace_id", profile.workspace_id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

export interface DryRunResult {
  error?: string;
  status?: number;
  body?: Record<string, unknown>;
}

// "Test payload" on the connector page: runs a pasted JSON payload through
// exactly the same validation as POST /api/leads/inbound, scoped to the
// caller's own workspace, and reports what would happen. Nothing is saved and
// nothing is written to the delivery log.
export async function dryRunIntake(payload: string): Promise<DryRunResult> {
  const profile = await requireProfile();
  if (!INTAKE_ROLES.includes(profile.role)) return { error: "Not allowed." };
  if (payload.length > 20_000) return { error: "Payload is too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { error: "That is not valid JSON." };
  }
  // Service client only after the role check above; every query inside
  // processInbound is filtered by this workspace id.
  const result = await processInbound({
    admin: createServiceClient(),
    workspaceId: profile.workspace_id,
    raw,
    ip: "dry-run",
    dryRun: true,
  });
  return { status: result.status, body: result.body };
}
