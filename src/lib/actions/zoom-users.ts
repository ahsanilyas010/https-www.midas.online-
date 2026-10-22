"use server";

import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { getZoomCredentials } from "@/lib/zoom/credentials";
import { lookupZoomUser, ZoomError } from "@/lib/zoom/client";

export type ZoomUserState = "found" | "missing" | "inactive";

export interface ZoomUsersResult {
  error?: string;
  // keyed by profile id
  users?: Record<string, ZoomUserState>;
}

// People > "Check Zoom users": for every person who dials or hosts meetings,
// is there a Zoom user with the same email as their login here? Run on demand
// (one Zoom call per person), never on page load.
export async function checkZoomUsers(): Promise<ZoomUsersResult> {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const creds = await getZoomCredentials(profile.workspace_id, { requireConnected: true });
  if (!creds) return { error: "Zoom isn't connected yet. Connect it under Integrations > Zoom first." };

  const supabase = await createRealClient();
  const { data: people } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_active", true)
    .in("role", ["agent", "team_lead", "ops_manager", "super_admin"])
    .limit(200);

  const users: Record<string, ZoomUserState> = {};
  try {
    for (const p of people ?? []) {
      const r = await lookupZoomUser(creds, p.email);
      users[p.id] = !r.found ? "missing" : r.status && r.status !== "active" ? "inactive" : "found";
    }
  } catch (e) {
    return { error: e instanceof ZoomError ? e.message : "Could not check Zoom just now. Try again." };
  }
  return { users };
}
