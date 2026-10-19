"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRealClient } from "@/lib/supabase/real";
import { checkRealRateLimit } from "@/lib/rate-limit";

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

  // Anything unexpected (database unreachable, misconfigured deployment, ...)
  // is caught and shown on the form. Left to throw, it would replace the whole
  // page with the error boundary. redirect() is called after the try block
  // because it works by throwing.
  let destination: string;
  try {
    const hdrsForLimit = await headers();
    const ipForLimit = hdrsForLimit.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = await checkRealRateLimit("login", `${ipForLimit}:${email.toLowerCase()}`, 10, 300);
    if (!allowed) {
      return { error: "Too many attempts. Wait a few minutes and try again.", email };
    }

    const supabase = await createRealClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Deliberately generic — don't reveal whether the account exists.
      return { error: "Incorrect email or password.", email };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .single();

    destination = profile?.must_change_password ? "/change-password" : safeNext(next);
  } catch (e) {
    console.error("signIn failed", e instanceof Error ? e.message : e);
    return { error: "We couldn't sign you in right now. Please try again in a moment.", email };
  }

  redirect(destination);
}

export async function signOut() {
  const supabase = await createRealClient();
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

  const supabase = await createRealClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?signed_out=1");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false, password_set_at: new Date().toISOString() })
    .eq("id", user.id);

  // The auth password already changed above — don't leave the user stuck
  // on this screen with no explanation if the profile-side update is
  // rejected (e.g. by guard_profile_self_update()'s RLS trigger).
  if (profileError) {
    return { error: `Password changed, but couldn't finish sign-in setup: ${profileError.message}` };
  }

  redirect("/start");
}
