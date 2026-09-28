import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRealClient } from "@/lib/supabase/real";
import type { Tables } from "@/lib/supabase/types";
import type { RealTables } from "@/lib/supabase/real-types";

export type Profile = Tables<"profiles">;
export type RealProfile = RealTables<"profiles">;

// Used by every existing signed-in page (sales-demo personas and real
// customers alike) — see src/lib/supabase/server.ts's createClient() for
// why this still resolves against the in-memory demo/workspace store.
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No valid user behind the cookie (expired, revoked, or never signed in):
  // signed_out clears it in the middleware.
  if (!user) redirect("/login?signed_out=1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login?signed_out=1");
  if (profile.must_change_password) redirect("/change-password");

  return profile;
}

// Used only by Phase 1's new real-Postgres surfaces (the onboarding
// wizard, branding settings) — a genuine Supabase Auth session, read
// straight from the real profiles table, never the demo/workspace store.
// A sales-demo persona has no real session and is never routed here.
export async function requireRealProfile(): Promise<RealProfile> {
  const supabase = await createRealClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?signed_out=1");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login?signed_out=1");
  return profile;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string | null;
}

// Gate for the vendor's own /platform pages. Deliberately separate from
// requireProfile() — a platform_admin has no workspace/profiles row at all,
// by design (spec: "platform_admins is a separate table outside any
// workspace").
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const supabase = await createRealClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?signed_out=1");

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!admin) redirect("/login?signed_out=1");
  return admin;
}
