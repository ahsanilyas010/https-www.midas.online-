"use server";

import { headers } from "next/headers";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { activeAgentCount } from "@/lib/workspace/limits";
import { workspaceFromRow } from "@/lib/accounts/adapters";
import { createServiceClient } from "@/lib/supabase/service";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { FREE_AGENT_SEATS, SELF_SERVE_MAX_AGENTS } from "@/lib/plan";

async function ownerContext() {
  const member = await requireRealProfile();
  if (member.role !== "super_admin") return { error: "Only the workspace admin can manage billing." } as const;
  const workspace = workspaceFromRow(await getCurrentWorkspace());
  return { ws: { workspace, member } } as const;
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
  const min = Math.max(FREE_AGENT_SEATS + 1, (await activeAgentCount(createServiceClient(), ws.workspace.id)));
  if (!Number.isFinite(n) || n < min) return { error: `Choose at least ${min} agent seats.` };
  if (n > SELF_SERVE_MAX_AGENTS) return { error: `For more than ${SELF_SERVE_MAX_AGENTS} agents, contact us for volume pricing.` };
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

// Was a Stripe-less "preview upgrade" for the old in-memory-only fallback
// (no Firebase configured). Real accounts always live in Supabase now, so
// there's no more unconfigured state for this to apply to — kept as a
// stub so admin/billing/page.tsx's "offline" mode still has something to
// call, but it always declines.
export async function simulateUpgrade(): Promise<{ error?: string }> {
  return { error: "Not available. Contact us to upgrade." };
}
