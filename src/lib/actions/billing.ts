"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { accounts } from "@/lib/accounts";
import { getWorkspaceContext } from "@/lib/accounts/session";
import { activeAgentCount } from "@/lib/accounts/limits";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { FREE_AGENT_SEATS, SELF_SERVE_MAX_USERS } from "@/lib/pricing";

async function ownerContext() {
  const ws = await getWorkspaceContext();
  if (!ws) return { error: "Billing is available in your own workspace." } as const;
  if (ws.member.role !== "super_admin") return { error: "Only the workspace admin can manage billing." } as const;
  return { ws } as const;
}

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

// Upgrade: sends the admin to Stripe's hosted checkout to enter card details.
export async function startCheckout(seats: number): Promise<{ url?: string; error?: string }> {
  const ctx = await ownerContext();
  if ("error" in ctx) return { error: ctx.error };
  const { ws } = ctx;
  const n = Math.floor(seats);
  const min = Math.max(FREE_AGENT_SEATS + 1, activeAgentCount(ws.store));
  if (!Number.isFinite(n) || n < min) return { error: `Choose at least ${min} agent seats.` };
  if (n > SELF_SERVE_MAX_USERS) return { error: `For more than ${SELF_SERVE_MAX_USERS} agents, contact us for volume pricing.` };
  if (!stripeConfigured()) return { error: "Online payments aren't switched on yet. Contact us to upgrade." };
  try {
    return { url: await createCheckoutSession({ workspace: ws.workspace, email: ws.member.email, seats: n, origin: await origin() }) };
  } catch (e) {
    console.error("checkout failed", e);
    return { error: "Couldn't open the payment page. Please try again." };
  }
}

// Paid workspaces: Stripe's portal to change card or seats, see invoices, cancel.
export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const ctx = await ownerContext();
  if ("error" in ctx) return { error: ctx.error };
  const customer = ctx.ws.workspace.stripeCustomerId;
  if (!stripeConfigured() || !customer) return { error: "No billing account yet." };
  try {
    return { url: await createPortalSession(customer, await origin()) };
  } catch (e) {
    console.error("portal failed", e);
    return { error: "Couldn't open billing. Please try again." };
  }
}

// Preview deployments only (in-memory accounts, no Stripe): lets you try the
// upgraded experience without a payment gateway. Never available once
// Firebase or Stripe is connected.
export async function simulateUpgrade(seats: number): Promise<{ error?: string }> {
  if (stripeConfigured() || accounts().kind !== "local") return { error: "Not available." };
  const ctx = await ownerContext();
  if ("error" in ctx) return { error: ctx.error };
  const n = Math.min(Math.max(Math.floor(seats), FREE_AGENT_SEATS + 1), SELF_SERVE_MAX_USERS);
  await accounts().updateWorkspace(ctx.ws.workspace.id, { plan: "paid", agentSeats: n, billingStatus: "active" });
  revalidatePath("/", "layout");
  return {};
}
