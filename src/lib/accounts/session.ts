import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { accounts } from "./index";
import { workspaceStore } from "@/lib/demo/workspace";
import type { Member, Workspace } from "./types";
import type { DemoStore } from "@/lib/demo/store";

export const SESSION_COOKIE = "callmilalo_session";

export interface WorkspaceContext {
  workspace: Workspace;
  member: Member;
  members: Member[];
  store: DemoStore;
}

// The signed-in customer's workspace for this request, or null for demo
// visitors and signed-out users. Cached per request.
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const backend = accounts();
  const session = await backend.verifySession(token);
  if (!session) return null;
  const [workspace, members] = await Promise.all([backend.getWorkspace(session.workspaceId), backend.listMembers(session.workspaceId)]);
  const member = members.find((m) => m.uid === session.uid);
  if (!workspace || !member) return null;
  return { workspace, member, members, store: workspaceStore(workspace, members) };
});

export async function setSessionCookie(token: string, maxAgeSeconds: number) {
  (await cookies()).set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await accounts().revokeSession(token).catch(() => {});
  jar.delete(SESSION_COOKIE);
}
