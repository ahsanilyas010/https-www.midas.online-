import "server-only";
import { AccountError } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/service";
import type { RealTablesUpdate } from "@/lib/supabase/real-types";
import type { Role, Workspace } from "./types";

export * from "./types";
export { AccountError };

interface AccountsApi {
  kind: "supabase";
  createMember(input: {
    workspaceId: string;
    email: string;
    password: string;
    fullName: string;
    role: Role;
  }): Promise<{ uid: string }>;
  setPassword(uid: string, password: string): Promise<void>;
  updateMember(uid: string, patch: Partial<Pick<import("./types").Member, "fullName" | "role" | "mustChangePassword">>): Promise<void>;
  setMemberActive(uid: string, active: boolean): Promise<void>;
  updateWorkspace(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<void>;
}

function toWorkspaceRow(patch: Partial<Omit<Workspace, "id" | "createdAt">>): RealTablesUpdate<"workspaces"> {
  const row: RealTablesUpdate<"workspaces"> = {};
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.agentSeats !== undefined) row.seat_limit = patch.agentSeats;
  if (patch.billingStatus !== undefined) row.billing_status = patch.billingStatus;
  if (patch.stripeCustomerId !== undefined) row.stripe_customer_id = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined) row.stripe_subscription_id = patch.stripeSubscriptionId;
  if (patch.name !== undefined) row.name = patch.name;
  return row;
}

// Every real account now lives in Supabase (Auth + Postgres) — there is no
// more Firebase/in-memory duality. `kind` stays on the returned object only
// because src/lib/actions/billing.ts's simulateUpgrade() (a Stripe-less
// preview affordance from the old "local" fallback) checks it; it now
// always reports "supabase", so that preview path is permanently
// unavailable rather than removed outright — a deliberate, low-risk choice
// to avoid touching billing.ts in Phase 1.
export function accounts(): AccountsApi {
  return {
    kind: "supabase",

    async createMember({ workspaceId, email, password, fullName, role }) {
      const admin = createServiceClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) {
        if (error?.code === "email_exists") {
          throw new AccountError("email_exists", "There's already an account with this email.");
        }
        throw new AccountError("unavailable", error?.message ?? "Could not create the login.");
      }

      const { error: profileError } = await admin.from("profiles").insert({
        id: data.user.id,
        workspace_id: workspaceId,
        email,
        full_name: fullName,
        role,
        must_change_password: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
        throw new AccountError("unavailable", profileError.message);
      }

      return { uid: data.user.id };
    },

    async setPassword(uid, password) {
      const admin = createServiceClient();
      const { error } = await admin.auth.admin.updateUserById(uid, { password });
      if (error) throw new AccountError("unavailable", error.message);
    },

    async updateMember(uid, patch) {
      const admin = createServiceClient();
      const row: RealTablesUpdate<"profiles"> = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.role !== undefined) row.role = patch.role;
      if (patch.mustChangePassword !== undefined) row.must_change_password = patch.mustChangePassword;
      const { error } = await admin.from("profiles").update(row).eq("id", uid);
      if (error) throw new AccountError("unavailable", error.message);
    },

    async setMemberActive(uid, active) {
      const admin = createServiceClient();
      const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", uid);
      if (error) throw new AccountError("unavailable", error.message);
    },

    async updateWorkspace(id, patch) {
      const admin = createServiceClient();
      const { error } = await admin.from("workspaces").update(toWorkspaceRow(patch)).eq("id", id);
      if (error) throw new AccountError("unavailable", error.message);
    },
  };
}
