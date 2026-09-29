import "server-only";
import type { RealTables } from "@/lib/supabase/real-types";
import type { Workspace, Member } from "./types";

// Maps real Postgres rows onto the Workspace/Member shape every existing
// CRM action file and page already expects — the same shape Firestore
// documents used to fill. Keeping the shape stable is what let ~40
// pre-existing files keep working unchanged when identity moved off
// Firebase.
export function workspaceFromRow(row: RealTables<"workspaces">): Workspace {
  const signup = (row.signup ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    ownerUid: row.created_by ?? "",
    plan: row.plan,
    agentSeats: row.seat_limit,
    billingStatus: row.billing_status as Workspace["billingStatus"],
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    teamSize: (signup.team_size as string | undefined) ?? null,
    phone: null,
    signup,
    brandLogoUrl: row.brand_logo_url,
    brandPrimaryColor: row.brand_primary_color,
    brandProductName: row.brand_product_name,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

export function memberFromProfile(row: RealTables<"profiles">): Member {
  return {
    uid: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as Member["role"],
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
  };
}
