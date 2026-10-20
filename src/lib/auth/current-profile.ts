import { redirect } from "next/navigation";
import { createRealClient } from "@/lib/supabase/real";
import type { RealTables } from "@/lib/supabase/real-types";

export type Profile = RealTables<"profiles">;
export type RealProfile = Profile;

// The signed-in user's profile from the real, RLS-governed Postgres
// (Supabase Auth session cookie -> profiles row). Every signed-in page and
// action goes through this; there is no other identity source.
export async function requireProfile(): Promise<Profile> {
  const supabase = await createRealClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No valid user behind the cookie (expired, revoked, or never signed in):
  // signed_out clears it in the middleware.
  if (!user) redirect("/login?signed_out=1");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/login?signed_out=1");
  if (!profile.is_active) redirect("/login?signed_out=1");
  if (profile.must_change_password) redirect("/change-password");

  return profile;
}

// Same as requireProfile() but without the forced-password-change redirect
// (the change-password page itself uses it).
export async function requireRealProfile(): Promise<Profile> {
  const supabase = await createRealClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?signed_out=1");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) redirect("/login?signed_out=1");
  return profile;
}

// Role gate: redirects to the user's own home when the role isn't allowed.
export async function requireRole(roles: Profile["role"][]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/start");
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
