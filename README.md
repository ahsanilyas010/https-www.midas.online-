# DialDesk — interactive demo

A contact-centre CRM and workforce platform, packaged as a **self-contained
demo** for showing prospects the product with **dummy data only**. No real
client data is included, no database is connected, and no environment
variables or API keys are needed.

It is a copy of the CallingCRM codebase with three changes:

1. **In-memory demo data.** The Supabase client is replaced by an in-memory
   implementation of the same query API (`src/lib/demo`), seeded with
   realistic but fictional clients, campaigns, agents, leads, calls,
   attendance, QA reviews and Zoom meetings. Every page and action runs its
   original code against it.
2. **Zoom meetings.** Book a Zoom meeting from any lead in the dial
   workspace, start an instant meeting, see upcoming, live and past meetings
   with recordings and AI summaries (`/meetings`), and manage the integration
   (`/admin/integrations`). In the demo, meetings open a simulated Zoom room.
3. **A new colourful interface.** Midnight/indigo/gold theme, gradient
   sidebar, animated stat tiles, command palette (Ctrl/⌘ + K), a demo bar to
   switch roles or reset data, a softphone in the dial workspace and
   celebrations on conversions.

## Demo logins

Pick a role on the login page, or sign in with any account below. **Every
account uses the same password: `DialDesk@123`.**

| Role | Email |
| --- | --- |
| Super admin | admin@dialdesk.demo |
| Ops manager | ops@dialdesk.demo |
| Team lead | teamlead@dialdesk.demo, ayesha@dialdesk.demo |
| QA | qa@dialdesk.demo |
| Agent | agent@dialdesk.demo, zara@, hamza@, mariam@, ali@, noor@, saad@, iqra@dialdesk.demo |
| Client viewer | client@dialdesk.demo |

The People page (`/admin/people`) lists every login. Users created there
also get `DialDesk@123`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repository in Vercel (framework: Next.js; defaults are fine).
2. No environment variables are needed. Deploy.
3. Add your domain under **Project → Settings → Domains**.

### How demo data behaves when hosted

Data lives in the server's memory. Changes made during a demo (calls
logged, meetings booked, users created) persist while that server instance
is running, and everything returns to the fresh sample when the instance
restarts or someone presses **Reset data** in the demo bar. On Vercel, a
quiet deployment may be restarted between visits, and under heavy traffic
two visitors can land on different instances, so treat changes as
temporary. The seeded data is always the same.

## Notes

- `supabase/migrations` holds the database schema of the original app, for
  reference only. The demo doesn't use it.
- `supabase/migrations/00000000000036_zoom_integration.sql` sketches the
  tables the Zoom feature would need in a real deployment.
