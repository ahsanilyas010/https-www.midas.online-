# CallMilalo — interactive demo

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

CallMilalo is a product of **Assorted Business LLC** (United States). The
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
account uses the same password: `CallMilalo@123`.**

| Role | Email |
| --- | --- |
| Super admin | admin@callmilalo.demo |
| Ops manager | ops@callmilalo.demo |
| Team lead | teamlead@callmilalo.demo, ayesha@callmilalo.demo |
| QA | qa@callmilalo.demo |
| Agent | agent@callmilalo.demo, zara@, hamza@, mariam@, ali@, noor@, saad@, iqra@callmilalo.demo |
| Client viewer | client@callmilalo.demo |

The People page (`/admin/people`) lists every login. Users created there
also get `CallMilalo@123`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Sign-ups, Firebase and Stripe

Visitors can create their own workspace at **/signup** (the target for ad
campaigns). A new workspace gets **3 agents free**; admins, ops managers,
team leads, QA and client logins are always free. Adding a 4th agent sends
the admin to **Plan & billing** (`/admin/billing`), where they choose seats
and pay by card on Stripe's hosted checkout.

| Piece | Where | Switched on by |
|---|---|---|
| Logins, workspaces, plans, people | Firebase Auth + Firestore (`src/lib/accounts`) | `FIREBASE_*` env vars |
| Card payments, subscriptions, invoices | Stripe Checkout + customer portal (`src/lib/billing`) | `STRIPE_*` env vars |
| Ad tracking | Meta Pixel (`MARKETING.metaPixelId` in `src/lib/brand.ts`) | the pixel ID |
| Prices | `src/lib/pricing.ts` | edit the file |

Without the Firebase variables, sign-ups are kept in server memory (fine
for trying the flow on a preview, not for real customers). Without Stripe,
**Plan & billing** offers a no-payment "preview upgrade" while accounts are
in memory, and a "contact us" note once Firebase is connected.

**Current limit:** logins, workspaces, plans and people are stored in
Firebase, but the CRM records a workspace creates (campaigns, leads, calls,
attendance…) are still held in server memory, like the demo. Moving them
to Firestore is the next phase and should land before real customers
start working in the app.

### Firebase setup
1. Create a project at console.firebase.google.com.
2. **Authentication → Sign-in method:** enable **Email/Password**.
3. **Firestore Database:** create it in production mode. The app only
   accesses Firestore from the server with a service account, so the
   default "deny all" client rules are correct.
4. **Project settings → Service accounts → Generate new private key.** From
   the JSON: `project_id` → `FIREBASE_PROJECT_ID`, `client_email` →
   `FIREBASE_CLIENT_EMAIL`, `private_key` → `FIREBASE_PRIVATE_KEY`.
5. **Project settings → General → Web API key** → `FIREBASE_WEB_API_KEY`.

Firestore collections: `workspaces/{id}` (name, plan, agentSeats,
billing, sign-up source incl. utm/fbclid) and `members/{uid}` (workspace,
role, name, active).

### Stripe setup
1. **Product catalogue → Add product** "CallMilalo agent seat", recurring
   monthly, pricing model **Graduated**, per unit: 1–3 → $0, 4–50 → $10,
   51–200 → $8. Copy the price ID → `STRIPE_PRICE_ID`.
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
2. The demo needs no environment variables. For real sign-ups and payments,
   add the Firebase and Stripe variables from `.env.example` (see above).
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

- `supabase/migrations` holds the database schema of the original app, for
  reference only. The demo doesn't use it.
- `supabase/migrations/00000000000036_zoom_integration.sql` sketches the
  tables the Zoom feature would need in a real deployment.
