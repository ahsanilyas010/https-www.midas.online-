"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { activeAgentCount, seatLimitMessage } from "@/lib/workspace/limits";
import { ingestLeadFile } from "@/lib/actions/lead-upload";
import type { RealEnums } from "@/lib/supabase/real-types";

export interface OnboardingActionState {
  error?: string;
  ok?: boolean;
}

async function requireManager() {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    throw new Error("Only an admin can do this.");
  }
  return profile;
}

async function advance(supabase: Awaited<ReturnType<typeof createRealClient>>, workspaceId: string, step: string) {
  await supabase.rpc("mark_onboarding_step", { p_workspace_id: workspaceId, p_step: step });
}

// Step 1 shows the same "advance" pattern via updateBranding() in
// src/lib/actions/branding.ts.

// Step 2 — first campaign.
const campaignSchema = z.object({
  name: z.string().trim().min(2, "Give the campaign a name.").max(120),
  vertical: z.string().trim().max(60).optional(),
  country: z.string().trim().max(2).optional(),
  timezone: z.string().trim().max(60).default("UTC"),
});

export async function createFirstCampaign(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();

  const parsed = campaignSchema.safeParse({
    name: formData.get("name"),
    vertical: formData.get("vertical") || undefined,
    country: formData.get("country") || undefined,
    timezone: formData.get("timezone") || "UTC",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid campaign." };

  const supabase = await createRealClient();
  const { error } = await supabase.from("campaigns").insert({
    workspace_id: workspace.id,
    name: parsed.data.name,
    vertical: parsed.data.vertical ?? null,
    country: parsed.data.country?.toUpperCase() ?? null,
    timezone: parsed.data.timezone,
  });
  if (error) return { error: error.message };

  await advance(supabase, workspace.id, "twilio");
  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

// Step 3 — Twilio connect. Storage only in Phase 1: live verification and
// the "Call button disabled until connected" UX are Phase 3 (see
// supabase/migrations/00000000000042_lead_shells_and_twilio.sql).
const twilioSchema = z.object({
  account_sid: z.string().trim().min(10, "Enter a valid Account SID.").max(64),
  auth_token: z.string().trim().min(10, "Enter a valid Auth Token.").max(128),
});

export async function saveTwilioCredentials(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();

  const parsed = twilioSchema.safeParse({
    account_sid: formData.get("account_sid"),
    auth_token: formData.get("auth_token"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid Twilio credentials." };

  const admin = createServiceClient();
  const { error } = await admin.rpc("set_twilio_credentials", {
    p_workspace_id: workspace.id,
    p_account_sid: parsed.data.account_sid,
    p_auth_token: parsed.data.auth_token,
  });
  if (error) return { error: error.message };

  const supabase = await createRealClient();
  await advance(supabase, workspace.id, "data");
  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

export async function skipTwilioStep(): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();
  await advance(supabase, workspace.id, "data");
  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

// Step 4 — first data upload. Real column mapping + dedupe against
// existing leads and the suppression list (src/lib/actions/lead-upload.ts)
// — screening itself (stamping screened_at) is a separate manager action
// once the batch is in, not part of onboarding.
export async function uploadFirstLeadBatch(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const profile = await requireManager();
  const workspace = await getCurrentWorkspace();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV or XLSX file to upload." };
  }

  const supabase = await createRealClient();
  try {
    await ingestLeadFile(supabase, workspace.id, profile.id, file, null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not process the upload." };
  }

  await advance(supabase, workspace.id, "invite");
  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

export async function skipDataStep(): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();
  await advance(supabase, workspace.id, "invite");
  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

// Step 5 — invite teammates. Real Supabase Auth invite (sends an email if
// SMTP is configured on the project — see README "must configure by hand").
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  full_name: z.string().trim().min(2, "Enter their name.").max(80),
  role: z.enum(["ops_manager", "team_lead", "agent", "qa_analyst"] as [RealEnums<"app_role">, ...RealEnums<"app_role">[]]),
});

export async function inviteMember(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    role: formData.get("role") || "agent",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid invite." };

  if (parsed.data.role === "agent") {
    const supabase = await createRealClient();
    const used = await activeAgentCount(supabase, workspace.id);
    if (used >= workspace.seat_limit) return { error: seatLimitMessage(workspace.seat_limit) };
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.full_name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") return { error: "There's already an account with this email." };
    return { error: error?.message ?? "Could not send the invite." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    workspace_id: workspace.id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    must_change_password: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    return { error: profileError.message };
  }

  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

export async function finishOnboarding(): Promise<OnboardingActionState> {
  await requireManager();
  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();
  await advance(supabase, workspace.id, "done");
  return { ok: true };
}
