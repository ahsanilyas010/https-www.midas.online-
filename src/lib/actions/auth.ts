"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { accounts, AccountError } from "@/lib/accounts";
import { getWorkspaceContext, setSessionCookie } from "@/lib/accounts/session";

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/start";
}

export interface ActionResult {
  error?: string;
  email?: string;
}

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/start");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const hdrsForLimit = await headers();
  const ipForLimit = hdrsForLimit.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit("login", `${ipForLimit}:${email.toLowerCase()}`, 10, 300);
  if (!allowed) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  // Customer accounts first (sign-ups and the people they add), then the
  // demo logins.
  try {
    const session = await accounts().signIn(email, password);
    await setSessionCookie(session.token, session.maxAgeSeconds);
    redirect(session.member.mustChangePassword ? "/change-password" : safeNext(next));
  } catch (e) {
    if (e instanceof AccountError && (e.code === "disabled" || e.code === "unavailable")) {
      return { error: e.message, email };
    }
    if (!(e instanceof AccountError)) throw e; // includes redirect()
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately generic — don't reveal whether the account exists.
    return { error: "Incorrect email or password.", email };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  await supabase
    .from("profiles")
    .update({ last_login_at: new Date().toISOString(), last_login_ip: ip, failed_login_count: 0 })
    .eq("id", data.user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", data.user.id)
    .single();

  redirect(profile?.must_change_password ? "/change-password" : safeNext(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Minimum 10 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?signed_out=1");

  const ws = await getWorkspaceContext();
  if (ws) {
    try {
      await accounts().setPassword(user!.id, password);
      await accounts().updateMember(user!.id, { mustChangePassword: false });
    } catch (e) {
      return { error: e instanceof AccountError ? e.message : "Could not change the password." };
    }
  } else {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: error.message };
    }
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false, password_set_at: new Date().toISOString() })
    .eq("id", user!.id);

  // The auth password already changed above — don't leave the user
  // stuck on this screen with no explanation if the profile-side update
  // is rejected (e.g. by guard_profile_self_update()'s RLS trigger).
  if (profileError) {
    return { error: `Password changed, but couldn't finish sign-in setup: ${profileError.message}` };
  }

  await supabase.from("credential_events").insert({
    user_id: user!.id,
    actor_id: user!.id,
    event: "changed_by_user",
  });

  redirect("/start");
}
