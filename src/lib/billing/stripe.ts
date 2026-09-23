import "server-only";
import Stripe from "stripe";
import { FREE_AGENT_SEATS } from "@/lib/pricing";
import type { Workspace } from "@/lib/accounts/types";

// Stripe handles card entry (hosted Checkout), subscriptions and invoices;
// card numbers never touch our servers.
//
// Set on the deployment:
//   STRIPE_SECRET_KEY      sk_live_… (or sk_test_… while testing)
//   STRIPE_PRICE_ID        a recurring, per-seat price with *graduated*
//                          tiers matching src/lib/pricing.ts:
//                            1–3 → $0, 4–50 → $10, 51–200 → $8 (per month)
//   STRIPE_WEBHOOK_SECRET  whsec_… for /api/billing/webhook
//
// The subscription quantity is the workspace's total agent seats (free ones
// included), so Stripe's tiers produce exactly the price the pricing page
// shows.

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
}

export async function createCheckoutSession(opts: {
  workspace: Workspace;
  email: string;
  seats: number;
  origin: string;
}): Promise<string> {
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: opts.seats }],
    client_reference_id: opts.workspace.id,
    ...(opts.workspace.stripeCustomerId ? { customer: opts.workspace.stripeCustomerId } : { customer_email: opts.email }),
    subscription_data: { metadata: { workspaceId: opts.workspace.id } },
    metadata: { workspaceId: opts.workspace.id },
    allow_promotion_codes: true,
    success_url: `${opts.origin}/admin/billing?status=success`,
    cancel_url: `${opts.origin}/admin/billing?status=cancelled`,
  });
  return session.url!;
}

// Stripe's customer portal: change card, seats, see invoices, cancel.
export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/admin/billing` });
  return session.url;
}

// What a subscription means for the workspace's plan.
export function planFromSubscription(sub: Stripe.Subscription): Partial<Workspace> {
  const seats = sub.items.data[0]?.quantity ?? FREE_AGENT_SEATS;
  const live = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  return {
    plan: live ? "paid" : "free",
    agentSeats: live ? Math.max(seats, FREE_AGENT_SEATS) : FREE_AGENT_SEATS,
    billingStatus: sub.status === "past_due" ? "past_due" : live ? "active" : "canceled",
    stripeSubscriptionId: live ? sub.id : null,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
  };
}
