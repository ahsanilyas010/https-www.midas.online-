import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Profile = Tables<"profiles">;

export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No valid user behind the cookie (expired, revoked, or a server restart
  // dropped an in-memory session): signed_out clears it in the middleware.
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
