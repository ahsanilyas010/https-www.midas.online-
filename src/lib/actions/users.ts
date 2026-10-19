"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createServiceClient } from "@/lib/supabase/service";
import { generateTempPassword } from "@/lib/auth/generate-password";
import { accounts, AccountError } from "@/lib/accounts";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { activeAgentCount, seatLimitMessage } from "@/lib/workspace/limits";
import { createRealClient } from "@/lib/supabase/real";

export interface CreateUserResult {
  error?: string;
  tempPassword?: string;
  fullName?: string;
}

const ROLES = ["super_admin", "ops_manager", "team_lead", "agent", "lead_gen", "qa_analyst", "client"] as const;

// Only these IANA zones are offered by the UI; a free-text typo ("UK") once
// crashed the header clock for that account on every page.
const TIMEZONES = [
  "Asia/Karachi",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

const createSchema = z.object({
  full_name: z.string().trim().min(1, "Name and email are required."),
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(ROLES),
  agent_code: z.string().trim().max(32).optional(),
  team_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  timezone: z.enum(TIMEZONES).default("Asia/Karachi"),
});

function blankToUndefined(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
}

// Admin-issued credentials: a one-time password the person must change at
// first sign-in. Runs with the service role (creating an auth user needs it)
// so it re-checks the caller's role and workspace itself.
export async function createUser(_prev: CreateUserResult, formData: FormData): Promise<CreateUserResult> {
  const caller = await requireRealProfile();
  if (!["super_admin", "ops_manager"].includes(caller.role)) return { error: "Only admins can create users." };

  const parsed = createSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role") ?? "agent",
    agent_code: blankToUndefined(formData.get("agent_code")),
    team_id: blankToUndefined(formData.get("team_id")),
    client_id: blankToUndefined(formData.get("client_id")),
    timezone: blankToUndefined(formData.get("timezone")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  // Only a super admin may mint another super admin.
  if (input.role === "super_admin" && caller.role !== "super_admin") {
    return { error: "Only a super admin can create another super admin." };
  }
  if (input.role === "client" && !input.client_id) return { error: "Choose which client this login belongs to." };

  const admin = createServiceClient();
  const workspace = await getCurrentWorkspace();

  // team_id / client_id must belong to the caller's own workspace.
  if (input.team_id) {
    const { data } = await admin.from("teams").select("id").eq("id", input.team_id).eq("workspace_id", workspace.id).maybeSingle();
    if (!data) return { error: "Unknown team." };
  }
  if (input.client_id) {
    const { data } = await admin.from("clients").select("id").eq("id", input.client_id).eq("workspace_id", workspace.id).maybeSingle();
    if (!data) return { error: "Unknown client." };
  }

  if (input.role === "agent") {
    const used = await activeAgentCount(admin, workspace.id);
    if (used >= workspace.seat_limit) return { error: seatLimitMessage(workspace.seat_limit) };
  }

  const tempPassword = generateTempPassword();
  let uid: string;
  try {
    uid = (
      await accounts().createMember({
        workspaceId: workspace.id,
        email: input.email,
        password: tempPassword,
        fullName: input.full_name,
        role: input.role,
      })
    ).uid;
  } catch (e) {
    return { error: e instanceof AccountError ? e.message : "Could not create the login. Try again." };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      agent_code: input.agent_code ?? null,
      team_id: input.team_id ?? null,
      client_id: input.client_id ?? null,
      timezone: input.timezone,
    })
    .eq("id", uid);
  if (updateError) return { error: `Created the login but couldn't save the profile details: ${updateError.message}` };

  await admin.from("credential_events").insert([
    { workspace_id: workspace.id, user_id: uid, actor_id: caller.id, event: "created" },
    { workspace_id: workspace.id, user_id: uid, actor_id: caller.id, event: "temp_issued" },
  ]);

  revalidatePath("/admin/people");
  return { tempPassword, fullName: input.full_name };
}

export interface ResetPasswordResult {
  error?: string;
  tempPassword?: string;
}

export async function resetPassword(_prev: ResetPasswordResult, formData: FormData): Promise<ResetPasswordResult> {
  const caller = await requireRealProfile();
  if (!["super_admin", "ops_manager"].includes(caller.role)) return { error: "Only admins can reset passwords." };

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "Missing user." };

  const admin = createServiceClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .eq("workspace_id", caller.workspace_id)
    .maybeSingle();
  if (!target) return { error: "Unknown user." };
  if (target.role === "super_admin" && caller.role !== "super_admin") {
    return { error: "Only a super admin can reset another super admin's password." };
  }

  const tempPassword = generateTempPassword();
  try {
    await accounts().setPassword(userId, tempPassword);
    await accounts().updateMember(userId, { mustChangePassword: true });
  } catch (e) {
    return { error: e instanceof AccountError ? e.message : "Could not reset the password." };
  }

  await admin
    .from("credential_events")
    .insert({ workspace_id: caller.workspace_id, user_id: userId, actor_id: caller.id, event: "reset_by_admin" });
  return { tempPassword };
}

export interface AssignResult {
  error?: string;
  ok?: boolean;
}

// People row menu: put an agent on a campaign's roster.
export async function assignPersonToCampaign(campaignId: string, userId: string): Promise<AssignResult> {
  const caller = await requireRealProfile();
  if (!["super_admin", "ops_manager"].includes(caller.role)) return { error: "Only admins can assign people to campaigns." };

  const supabase = await createRealClient();
  const [{ data: campaign }, { data: person }] = await Promise.all([
    supabase.from("campaigns").select("id").eq("id", campaignId).maybeSingle(),
    supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
  ]);
  if (!campaign || !person) return { error: "Unknown campaign or person." };
  if (person.role !== "agent") return { error: "Only agents are assigned to campaigns." };

  const { error } = await supabase
    .from("campaign_assignments")
    .upsert(
      { workspace_id: caller.workspace_id, campaign_id: campaignId, user_id: userId },
      { onConflict: "campaign_id,user_id", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };
  revalidatePath("/admin/people");
  revalidatePath("/admin/campaigns");
  return { ok: true };
}
