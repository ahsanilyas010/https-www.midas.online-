import type Stripe from "stripe";
import { accounts } from "@/lib/accounts";
import { planFromSubscription, stripe, stripeConfigured } from "@/lib/billing/stripe";

// Stripe → workspace plan. Configure in the Stripe dashboard (Developers →
// Webhooks) pointing at https://<domain>/api/billing/webhook with events:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) return new Response("Billing is not configured", { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const apply = async (sub: Stripe.Subscription) => {
    const workspaceId = sub.metadata?.workspaceId;
    if (!workspaceId) return;
    await accounts().updateWorkspace(workspaceId, planFromSubscription(sub));
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await apply(await stripe().subscriptions.retrieve(subId));
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await apply(event.data.object);
      break;
  }
  return Response.json({ received: true });
}
