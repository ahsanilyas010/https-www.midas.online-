"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTempPassword } from "@/lib/auth/generate-password";
import type { Enums } from "@/lib/supabase/types";

export interface CreateUserResult {
  error?: string;
  tempPassword?: string;
  fullName?: string;
}

// Section 3.1 — the credential flow the admin panel implements. Runs with
// the service-role client (bypasses RLS) but re-checks the caller's role
// itself first, since RLS isn't there to protect a service-role call.
export async function createUser(
  _prev: CreateUserResult,
  formData: FormData,
): Promise<CreateUserResult> {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return { error: "Not signed in." };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (!callerProfile || !["super_admin", "ops_manager"].includes(callerProfile.role)) {
    return { error: "Only admins can create users." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "agent") as Enums<"app_role">;
  const agentCode = String(formData.get("agent_code") ?? "").trim() || null;
  const teamId = String(formData.get("team_id") ?? "").trim() || null;
  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "Asia/Karachi").trim();
  const allowOutsideShift = formData.get("allow_login_outside_shift") === "on";

  if (!fullName || !email) {
    return { error: "Name and email are required." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not set on the server yet — paste it into .env.local (see the comment there) and restart the app.",
    };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the auth user." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    agent_code: agentCode,
    role,
    team_id: teamId,
    client_id: clientId,
    timezone,
    allow_login_outside_shift: allowOutsideShift,
    must_change_password: true,
  });

  if (profileError) {
    // Roll back the orphaned auth user so a failed create doesn't leave a
    // login with no profile behind it.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await admin.from("credential_events").insert([
    { user_id: created.user.id, actor_id: caller.id, event: "created", ip },
    { user_id: created.user.id, actor_id: caller.id, event: "temp_issued", ip },
  ]);

  return { tempPassword, fullName };
}

export interface ResetPasswordResult {
  error?: string;
  tempPassword?: string;
}

export async function resetPassword(
  _prev: ResetPasswordResult,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const supabase = await createClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) return { error: "Not signed in." };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();

  if (!callerProfile || !["super_admin", "ops_manager"].includes(callerProfile.role)) {
    return { error: "Only admins can reset passwords." };
  }

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "Missing user." };

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { error: error.message };

  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await admin.from("credential_events").insert({
    user_id: userId,
    actor_id: caller.id,
    event: "reset_by_admin",
    ip,
  });

  return { tempPassword };
}
