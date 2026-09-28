// Plan limits. Prices aren't published on the site; paid seats are priced
// in Stripe (see src/lib/billing/stripe.ts) and shown at checkout.

// Agents included free on every workspace. Admins, ops managers, team
// leads, QA analysts and client logins never use a seat.
export const FREE_AGENT_SEATS = 3;

// Above this many agents, upgrades go through sales instead of checkout.
export const SELF_SERVE_MAX_AGENTS = 200;
