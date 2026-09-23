"use server";

import { createClient } from "@/lib/supabase/server";
import { accounts } from "@/lib/accounts";
import { getWorkspaceContext } from "@/lib/accounts/session";
import { activeAgentCount, seatLimitMessage } from "@/lib/accounts/limits";

// Deactivate, never delete. A deleted user row orphans call attempts, QA
// reviews and attendance history — the audit trail this exists for.
async function setActive(userId: string, isActive: boolean) {
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
    return { error: "Only admins can change activation state." };
  }

  // Customer workspaces: the login is switched on/off in the accounts
  // backend too, and reactivating an agent needs a free seat.
  const ws = await getWorkspaceContext();
  if (ws) {
    const member = ws.members.find((m) => m.uid === userId);
    if (!member) return { error: "Unknown user." };
    if (member.uid === ws.workspace.ownerUid && !isActive) return { error: "The workspace owner can't be deactivated." };
    if (isActive && member.role === "agent" && activeAgentCount(ws.store) >= ws.workspace.agentSeats) {
      return { error: seatLimitMessage(ws.workspace.agentSeats) };
    }
    await accounts().setMemberActive(userId, isActive);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) return { error: error.message };

  if (!isActive) {
    await supabase
      .from("user_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "forced" })
      .eq("user_id", userId)
      .is("ended_at", null);
  }

  return {};
}

export async function deactivateUser(userId: string) {
  return setActive(userId, false);
}

export async function reactivateUser(userId: string) {
  return setActive(userId, true);
}
