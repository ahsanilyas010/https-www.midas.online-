# LeadCallient — interactive demo

A contact-centre CRM and workforce platform, packaged as a **self-contained
demo** for showing prospects the product with **dummy data only**. No real
client data is included, no database is connected, and no environment
variables or API keys are needed.

It is a copy of the CallingCRM codebase with four changes:

1. **In-memory demo data.** The Supabase client is replaced by an in-memory
   implementation of the same query API (`src/lib/demo`), seeded with
   realistic but fictional clients, campaigns, agents, leads, calls,
   attendance, QA reviews and Zoom meetings. Every page and action runs its
   original code against it.
2. **Zoom meetings.** Book a Zoom meeting from any lead in the dial
   workspace, start an instant meeting, see upcoming, live and past meetings
   with recordings and AI summaries (`/meetings`), and manage the integration
   (`/admin/integrations`). In the demo, meetings open a simulated Zoom room.
3. **Bring-your-own dialer.** Calls go through whichever calling service
   the client subscribes to: Zoom Phone, Dialpad, Google Voice, Aircall,
   RingCentral, Twilio or Vonage. There's a global softphone (keypad, recent
   calls, mute/hold/record/transfer), a Call button on every lead, and a
   dialer marketplace under **Integrations** to connect or switch providers,
   pick the caller ID and dial mode, and see the exact API request each
   provider would receive.
4. **A new colourful interface.** Midnight/indigo/gold theme, gradient
   sidebar, animated stat tiles, command palette (Ctrl/⌘ + K), a demo bar to
   switch roles or reset data, a softphone in the dial workspace and
   celebrations on conversions.

## Company

LeadCallient is a product of **Assorted Business LLC** (United States). The
company name, address, phone and email live in `COMPANY` in
`src/lib/brand.ts`; empty fields are hidden, so fill them in there when
they're ready and they'll appear in the landing-page footer and on the
sign-in page.

## Landing page

`/` is a public marketing page covering every feature: dial workspace,
bring-your-own dialer (with an interactive provider switcher), Zoom
meetings, live floor, attendance, QA, compliance, data sourcing, client
portal, security, roles and an FAQ. "Try the live demo" goes to the role
picker at `/login`; signed-in visitors get "Open the app" (`/start`, which
sends each role to its home screen).

## Demo logins

Pick a role on the login page, or sign in with any account below. **Every
account uses the same password: `LeadCallient@123`.**

| Role | Email |
| --- | --- |
| Super admin | admin@leadcallient.demo |
| Ops manager | ops@leadcallient.demo |
| Team lead | teamlead@leadcallient.demo, ayesha@leadcallient.demo |
| QA | qa@leadcallient.demo |
| Agent | agent@leadcallient.demo, zara@, hamza@, mariam@, ali@, noor@, saad@, iqra@leadcallient.demo |
| Client viewer | client@leadcallient.demo |

The People page (`/admin/people`) lists every login. Users created there
also get `LeadCallient@123`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Sign-ups, Supabase and Stripe

Visitors can create their own workspace at **/signup** (the target for ad
campaigns). A new workspace gets **3 agents free**; admins, ops managers,
team leads, QA and client logins are always free. Signing up drops them
into a short onboarding wizard (**/onboarding**: brand, first campaign,
connect Twilio, upload data, invite your team) before they reach the app.
Adding a 4th agent sends the admin to **Plan & billing** (`/admin/billing`),
where they choose seats and pay by card on Stripe's hosted checkout.

| Piece | Where | Switched on by |
|---|---|---|
| Logins, workspaces, onboarding, branding, platform admin | Supabase Auth + Postgres (`supabase/migrations`, `src/lib/accounts`, `src/app/onboarding`, `src/app/(platform)`) | `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` |
| Card payments, subscriptions, invoices | Stripe Checkout + customer portal (`src/lib/billing`) | `STRIPE_*` env vars |
| Ad tracking | Meta Pixel (`MARKETING.metaPixelId` in `src/lib/brand.ts`) | the pixel ID |
| Free agent limit | `src/lib/plan.ts` | edit the file (prices live only in Stripe) |

**Current limit (Phase 1):** logins, workspaces, profiles, campaigns
(skeleton), branding and Twilio credential storage are real, RLS-isolated
Postgres tables. The rest of the CRM a workspace uses day to day — leads,
calls, attendance, QA, the dialer — still lives in the same in-memory,
per-workspace store the sales demo uses (`src/lib/demo`), keyed off the
real Supabase identity instead of Firebase. Each of those features moves to
real Postgres in its own later phase (see the project's phased build plan);
nothing about today's demo or a real signup's day-to-day functionality
changed in Phase 1 — only what sits underneath the login itself.

### Supabase setup
1. Create a project at supabase.com (or run `supabase start` locally with
   the Supabase CLI).
2. **Project Settings → API**: copy the URL and anon key into
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the
   `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.
3. **Database → Extensions**: enable **Supabase Vault** (`supabase_vault`)
   before running the migrations — `supabase/migrations/00000000000042_lead_shells_and_twilio.sql`
   depends on it to store Twilio credentials encrypted.
4. `supabase link --project-ref <ref>` then `supabase db push` to apply
   `supabase/migrations` (the pre-Phase-1 single-tenant migrations live in
   `supabase/migrations_legacy_reference/` and are never applied).
5. Set `PLATFORM_ADMIN_EMAILS`, `ASSORTED_ADMIN_EMAIL`/`_PASSWORD`, and
   optionally `TWILIO_ACCOUNT_SID`/`_AUTH_TOKEN` and `DEMO_ALLOWED_NUMBERS`
   in `.env`, then run `npm run seed` to create the `assorted` and `demo`
   workspaces. Platform admins must already exist as Supabase Auth users
   (invite them from the Dashboard first) — the seed script attaches the
   `platform_admins` row, it doesn't create their login.
6. Run `npm run test:rls` against that project (staging/disposable only —
   see the script's header comment) to prove every RLS policy.
7. **Authentication → Email Templates / SMTP**: configure a sender so the
   onboarding wizard's "invite your team" step can actually deliver email.

### Stripe setup
1. **Product catalogue → Add product** "LeadCallient agent seat", recurring
   monthly, pricing model **Graduated**, per unit, with seats 1–3 at $0
   (the free agents) and your chosen price for the rest. Copy the price ID
   → `STRIPE_PRICE_ID`.
2. **Developers → API keys** → secret key → `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**
   `https://<your-domain>/api/billing/webhook` with events
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` → signing secret →
   `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Billing → Customer portal:** turn it on and allow updating
   quantities and payment methods.

## Deploy to Vercel

1. Import this repository in Vercel (framework: Next.js; defaults are fine).
2. The sales demo needs no environment variables. For real sign-ups and
   payments, add the Supabase and Stripe variables from `.env.example`
   (see above).
3. Add your domain under **Project → Settings → Domains**.

### How demo data behaves when hosted

Data lives in the server's memory. Changes made during a demo (calls
logged, meetings booked, users created) persist while that server instance
is running, and everything returns to the fresh sample when the instance
restarts or someone presses **Reset data** in the demo bar. On Vercel, a
quiet deployment may be restarted between visits, and under heavy traffic
two visitors can land on different instances, so treat changes as
temporary. The seeded data is always the same.

## Dialer integration: how it plugs in

- `src/lib/telephony/types.ts` defines the `DialerAdapter` contract (place a
  call, hang up, status) and the shared types.
- `src/lib/telephony/providers.ts` is the catalogue of supported services:
  auth type, credential fields, capabilities and how click-to-call works.
- `src/lib/telephony/adapters.ts` has one request builder per service, e.g.
  Dialpad `POST /api/v2/call`, Aircall `POST /v1/users/{id}/calls`,
  RingCentral RingOut, Twilio `Calls.json`, Vonage `/v1/calls`, and
  app links for Zoom Phone and Google Voice. `TELEPHONY_MODE` is the switch:
  `"demo"` simulates calls; `"live"` sends the prepared request.
- `src/lib/actions/dialer.ts` handles connecting and switching providers,
  settings, placing calls (with DNC and suppression checks) and the call log.
- `supabase/migrations/00000000000037_dialer_integration.sql` defines the
  `dialer_calls` table for a real deployment.

Going live needs encrypted credential storage, the OAuth flows for OAuth
providers, and webhook routes for call events. None of that is included
yet: the demo simulates the provider side.

## Notes

- `supabase/migrations` is the real, applied multi-tenant schema (Phase 1:
  workspaces, platform_admins, profiles, teams, clients, campaigns,
  audit_log, Twilio credential storage, lead/lead_batch shells) — see
  "Supabase setup" above. `supabase/migrations_legacy_reference/` holds the
  single-tenant schema of the original app, kept only as a naming/pattern
  reference; it's never applied.
