import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createRealClient } from "@/lib/supabase/real";
import { requireRealProfile } from "@/lib/auth/current-profile";
import type { RealTables } from "@/lib/supabase/real-types";

export type Workspace = RealTables<"workspaces">;

// The signed-in real customer's real-Postgres workspace row. Used only by
// Phase 1's new surfaces (branding settings, setup guide) — never by the
// pre-existing CRM pages, which keep reading workspace data out of the
// in-memory store via src/lib/accounts/session.ts's getWorkspaceContext().
export const getCurrentWorkspace = cache(async (): Promise<Workspace> => {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data: workspace } = await supabase.from("workspaces").select("*").eq("id", profile.workspace_id).single();
  if (!workspace) redirect("/login?signed_out=1");
  return workspace;
});
