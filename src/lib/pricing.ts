// Pricing — the single place to change prices. The pricing page, its
// calculator, the billing page, the landing page and the structured data
// all read from here (and the Stripe price must match: see
// src/lib/billing/stripe.ts).
//
// Only agents are billed. Admins, ops managers, team leads, QA analysts and
// client logins are free on every plan.
//
// Graduated per-agent pricing, like tax brackets: every workspace's first 3
// agents are free, agents 4–50 cost $10/month each, agents 51–200 cost
// $8/month each. Adding an agent never makes the bill go down. Above 200
// agents it's a custom quote.
export const PRICING = {
  currency: "USD",
  freeUsers: 3,
  tiers: [
    { upTo: 50, perUser: 10 },
    { upTo: 200, perUser: 8 },
  ],
  customAbove: 200,
  // Annual billing: pay for 10 months, get 12.
  annualMonthsCharged: 10,
} as const;

export const SELF_SERVE_MAX_USERS = PRICING.customAbove;

// Agents included free on every workspace.
export const FREE_AGENT_SEATS = PRICING.freeUsers;

// Monthly price for a workspace with `agents` agent seats, billed monthly.
export function monthlyPrice(agents: number): number {
  let total = 0;
  let from: number = PRICING.freeUsers;
  for (const tier of PRICING.tiers) {
    const inTier = Math.max(0, Math.min(agents, tier.upTo) - from);
    total += inTier * tier.perUser;
    from = tier.upTo;
  }
  return total;
}

// Price per month when paying yearly (10 months charged for 12).
export function annualMonthlyPrice(agents: number): number {
  return (monthlyPrice(agents) * PRICING.annualMonthsCharged) / 12;
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
}

export type Plan = {
  key: string;
  name: string;
  price: string;
  priceNote: string;
  users: string;
  blurb: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  points: string[];
};

const [growth, scale] = PRICING.tiers;

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Starter",
    price: "$0",
    priceNote: "free forever",
    users: `1–${PRICING.freeUsers} agents`,
    blurb: "Every feature, for small teams getting started or trying it out properly.",
    cta: { label: "Start free", href: "/signup" },
    points: ["All features included", "Unlimited admins, managers & QA", "Bring your own dialer", "No card needed"],
  },
  {
    key: "growth",
    name: "Growth",
    price: `$${growth.perUser}`,
    priceNote: "per agent / month",
    users: `Agents ${PRICING.freeUsers + 1}–${growth.upTo}`,
    blurb: `Your first ${PRICING.freeUsers} agents stay free; each one after that is $${growth.perUser} a month.`,
    cta: { label: "Start free, upgrade later", href: "/signup" },
    highlight: true,
    points: ["Everything in Starter", "Unlimited client portal logins", "Live floor & performance", "QA scorecards & compliance"],
  },
  {
    key: "scale",
    name: "Scale",
    price: `$${scale.perUser}`,
    priceNote: "per agent / month",
    users: `Agents ${growth.upTo + 1}–${scale.upTo}`,
    blurb: `Every agent from the ${growth.upTo + 1}st on drops to $${scale.perUser} a month.`,
    cta: { label: "Start free, upgrade later", href: "/signup" },
    points: ["Everything in Growth", "Multiple teams & campaigns", "Priority support", "Onboarding help"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceNote: "volume pricing",
    users: `${PRICING.customAbove}+ agents`,
    blurb: "Large floors, multiple sites or special contract and invoicing needs.",
    cta: { label: "Contact sales", href: "/contact" },
    points: ["Everything in Scale", "Custom contract & invoicing", "Dedicated account manager", "Migration assistance"],
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Who counts towards the price?",
    a: "Only agents: the people making calls. Admins, ops managers, team leads, QA analysts and client portal logins are free and unlimited. Deactivated agents don't count.",
  },
  {
    q: `Are the first ${PRICING.freeUsers} agents really free?`,
    a: `Yes, on every workspace, forever, with every feature. A team of ${PRICING.freeUsers} agents pays nothing; a team of 10 agents pays for 7.`,
  },
  {
    q: "What happens when we need a 4th agent?",
    a: "Your admin opens Plan & billing, picks how many agent seats you need and enters a card on our secure payment page. The new seats are available straight away.",
  },
  {
    q: "Do call minutes cost extra?",
    a: "Not from us. Calls go through the dialer you already subscribe to (Zoom Phone, Dialpad, Google Voice, Aircall, RingCentral and others), so minutes and numbers are billed by that provider.",
  },
  {
    q: `How does the $${scale.perUser} rate work?`,
    a: `Prices are graduated: agents ${PRICING.freeUsers + 1}–${growth.upTo} are $${growth.perUser} each and every agent from ${growth.upTo + 1} to ${scale.upTo} is $${scale.perUser}, so growing past ${growth.upTo} agents only lowers the price of the extra seats and never re-prices the ones you already have.`,
  },
  {
    q: "Can we change the number of agents later?",
    a: "Any time. Add or remove seats as your floor changes; changes are prorated on the next bill, and you can cancel whenever you like.",
  },
];
