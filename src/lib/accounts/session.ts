import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { createServiceClient } from "@/lib/supabase/service";
import { workspaceStore } from "@/lib/demo/workspace";
import type { DemoStore } from "@/lib/demo/store";
import type { Member, Workspace } from "./types";
import { workspaceFromRow, memberFromProfile } from "./adapters";

export interface WorkspaceContext {
  workspace: Workspace;
  member: Member;
  members: Member[];
  store: DemoStore;
}

// Cheap, network-free check for whether a real Supabase Auth session
// cookie is present, independent of the sales-demo's leadcallient_demo_user
// cookie. Used to skip the real-identity lookup entirely for demo-only
// visitors, even on a deployment where Supabase env vars are configured —
// and to detect "signed in" in src/middleware.ts and the marketing header
// without needing a network round trip there either.
export function hasRealSessionCookie(cookieStore: { getAll(): { name: string }[] }): boolean {
  return cookieStore.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

// The signed-in real customer's workspace for this request, or null for
// sales-demo visitors and signed-out users. Cached per request.
//
// Was Firebase + Firestore; now reads the real Supabase Auth session and
// the real workspaces/profiles tables, then hands back the exact same
// {workspace, member, members, store} shape every existing caller
// (src/lib/supabase/server.ts, the People/Billing pages, users.ts,
// deactivate.ts, ...) already expects — the in-memory `store` still backs
// every CRM feature that hasn't moved to real Postgres in its own phase
// yet, same as it did when identity lived in Firestore.
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  const cookieStore = await cookies();
  if (!hasRealSessionCookie(cookieStore)) return null;

  const supabase = createServerClient<RealDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) return null;

  // Full workspace row + full roster via the service role: mirrors how
  // this worked under Firestore (no RLS at all there), and several callers
  // (seat counting, the owner check, the People page) need every member
  // regardless of the signed-in member's own role.
  const admin = createServiceClient();
  const [{ data: workspaceRow }, { data: profileRows }] = await Promise.all([
    admin.from("workspaces").select("*").eq("id", profile.workspace_id).maybeSingle(),
    admin.from("profiles").select("*").eq("workspace_id", profile.workspace_id),
  ]);
  if (!workspaceRow) return null;

  const workspace = workspaceFromRow(workspaceRow);
  const members = (profileRows ?? []).map(memberFromProfile);
  const member = members.find((m) => m.uid === user.id);
  if (!member) return null;

  return { workspace, member, members, store: workspaceStore(workspace, members) };
});
