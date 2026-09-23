// Pricing — the single place to change prices. The pricing page, its
// calculator, the landing page and the structured data all read from here.
//
// Graduated per-user pricing, like tax brackets: every account's first 3
// users are free, users 4–50 cost $10/month each, users 51–200 cost $8/month
// each. Adding a user never makes the bill go down. Above 200 users it's a
// custom quote.
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

// Monthly price for `users` paid users on monthly billing.
export function monthlyPrice(users: number): number {
  let total = 0;
  let from: number = PRICING.freeUsers;
  for (const tier of PRICING.tiers) {
    const inTier = Math.max(0, Math.min(users, tier.upTo) - from);
    total += inTier * tier.perUser;
    from = tier.upTo;
  }
  return total;
}

// Price per month when paying yearly (10 months charged for 12).
export function annualMonthlyPrice(users: number): number {
  return (monthlyPrice(users) * PRICING.annualMonthsCharged) / 12;
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
    users: `1–${PRICING.freeUsers} users`,
    blurb: "Every feature, for small teams getting started or trying it out properly.",
    cta: { label: "Try the live demo", href: "/login" },
    points: ["All features included", "Bring your own dialer", "Zoom meetings", "No card needed"],
  },
  {
    key: "growth",
    name: "Growth",
    price: `$${growth.perUser}`,
    priceNote: "per user / month",
    users: `Users ${PRICING.freeUsers + 1}–${growth.upTo}`,
    blurb: `Your first ${PRICING.freeUsers} users stay free; each one after that is $${growth.perUser} a month.`,
    cta: { label: "Talk to us", href: "/contact" },
    highlight: true,
    points: ["Everything in Starter", "Unlimited client portal logins", "Live floor & performance", "QA scorecards & compliance"],
  },
  {
    key: "scale",
    name: "Scale",
    price: `$${scale.perUser}`,
    priceNote: "per user / month",
    users: `Users ${growth.upTo + 1}–${scale.upTo}`,
    blurb: `Every user from the ${growth.upTo + 1}st on drops to $${scale.perUser} a month.`,
    cta: { label: "Talk to us", href: "/contact" },
    points: ["Everything in Growth", "Multiple teams & campaigns", "Priority support", "Onboarding help"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceNote: "volume pricing",
    users: `${PRICING.customAbove}+ users`,
    blurb: "Large floors, multiple sites or special contract and invoicing needs.",
    cta: { label: "Contact sales", href: "/contact" },
    points: ["Everything in Scale", "Custom contract & invoicing", "Dedicated account manager", "Migration assistance"],
  },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "What counts as a user?",
    a: `Anyone with a staff login: agents, team leads, managers, QA analysts and admins. Client portal logins are free and unlimited. Deactivated users don't count.`,
  },
  {
    q: "Are the first 3 users really free?",
    a: `Yes, on every account and every plan. A team of ${PRICING.freeUsers} pays nothing; a team of 10 pays for 7 users.`,
  },
  {
    q: "Do call minutes cost extra?",
    a: "Not from us. Calls go through the dialer you already subscribe to (Zoom Phone, Dialpad, Google Voice, Aircall, RingCentral and others), so minutes and numbers are billed by that provider.",
  },
  {
    q: "How does the $8 rate work?",
    a: `Prices are graduated: users ${PRICING.freeUsers + 1}–${growth.upTo} are $${growth.perUser} each and every user from ${growth.upTo + 1} to ${scale.upTo} is $${scale.perUser}, so growing past ${growth.upTo} users only ever lowers the price of the extra seats and never re-prices the ones you already have.`,
  },
  {
    q: "Is there a discount for paying yearly?",
    a: `Yes. Pay annually and you're charged for ${PRICING.annualMonthsCharged} months instead of 12.`,
  },
  {
    q: "Can we change the number of users later?",
    a: "Any time. Add or remove users as your floor changes and the next bill follows.",
  },
];
