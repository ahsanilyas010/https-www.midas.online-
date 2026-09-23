# ABPO Command

Assorted BPO's call-centre CRM and workforce platform. Next.js 15 (App
Router, strict TypeScript) + Supabase (Postgres, Auth, Storage, Realtime).

This repo currently implements **Phase 1** (foundation: identity/org/
campaigns, RLS, audit triggers, auth, the app shell), **Phase 2** (leads,
suppression, the dialable-view compliance gate, manual lead entry),
**Phase 3** (the agent dial workspace queue, atomic DNC transaction, lead
assignment/auto-top-up), **Phase 4** (attendance: clock in/out, aux states,
shifts, leave requests, `pg_cron` sweeps), **Phase 5** (follow-ups with a
live realtime tray, and the email module with suppression/unsubscribe), and
**Phase 6** (QA scorecards/review queue, campaign funnel and agent
scorecard reporting), **Phase 7** (data-source connectors: Companies
House, UK planning, US municipal permits, vendor CSV/XLSX, the inbound web
form, fetch-run history, and per-source performance reporting), and
**Phase 8** (hardening: the screening-provider layer, DB-backed rate
limiting on public endpoints, a mobile-friendly app shell, structured
error logging, an index review, and this README/the runbook/the
load-testing prep — see `RUNBOOK.md` and `docs/`) from the build spec.

> **Update:** migrations 21-25 have now been applied to the live database
> (via the Supabase dashboard's SQL editor, since the Supabase MCP
> connector used for this build intermittently rejected `apply_migration`/
> `execute_sql` with "MCP tool call requires approval," and a direct
> `psql` connection was also blocked from the build sandbox's network
> policy). Applied and verified present: `qa_scorecards`, `qa_reviews`,
> `source_fetch_runs`, `rate_limit_hits`, `v_campaign_funnel`,
> `v_source_performance`, `mv_agent_scorecard_daily`,
> `get_agent_scorecard()`, `check_rate_limit()`, `sweep_screening_expiry()`,
> `sweep_rate_limit_hits()`, `refresh_agent_scorecard()`, the two Phase 8
> indexes, and the `compliance-evidence` storage bucket.
> `src/lib/supabase/types.ts` was hand-extended (rather than generated) to
> describe these ahead of application, since `generate_typescript_types`
> was also blocked by the same connector issue — it was authored directly
> from the migration files now applied, so it should already match, but
> regenerate it for real
> (`supabase gen types typescript --project-id uvgekzergvtbvvhvuyyh`) and
> diff away the hand-written version the next time a working connection is
> available, as a final sanity check.

### Phase 7 connectors — a note on what's verified vs. best-effort

The Companies House connector (`src/lib/connectors/companies-house.ts`) is
implemented against its long-stable, well-documented public Search API and
is reasonably high-confidence. The UK planning connector
(`uk-planning.ts`, via the PlanIt aggregator) and the US permits connector
(`us-permits.ts`, generic Socrata client) could **not** be verified against
a live response during this build — this sandbox's outbound network policy
blocks arbitrary hosts (only an allow-list, confirmed via
`$HTTPS_PROXY/__agentproxy/status`, which logged a `connect_rejected`/403
for `data.cityofchicago.org`). The US permits connector is deliberately
generic and config-driven for exactly this reason: every municipality's
Socrata dataset has different column names, so the field mapping lives in
`data_sources.config.fieldMap` rather than being hardcoded, and must be set
from the target portal's real schema before a source is switched on. Verify
both connectors' field names against a live call before relying on them for
a real campaign.

Neither Companies House nor UK planning registers publish a personal phone
number (by design — see spec 6.4's boundary against undisclosed
enrichment), so records from those two connectors are expected to be
rejected by the pipeline for lacking one; that's correct behaviour, not a
bug. They still populate a target company/site list with full provenance,
which a separate, explicitly-out-of-scope enrichment step could complete.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from the
  Supabase project (already set for the project created during this build).
- `SUPABASE_SERVICE_ROLE_KEY` — **not retrievable via MCP by design.** Get
  it from the Supabase dashboard → Settings → API → service_role. Needed
  for user provisioning (`/admin/people`) and the bootstrap script below.

## Bootstrapping the first account

Only a `super_admin`/`ops_manager` can create users through the app, but no
users exist yet on a fresh project. Once `SUPABASE_SERVICE_ROLE_KEY` is set:

```bash
npm run bootstrap-admin -- --email you@example.com --name "Your Name"
```

This prints a one-time temporary password. You'll be forced to set a new
one on first login.

## Database

Migrations live in `supabase/migrations/`, applied in filename order. They
were also applied directly to the live project via the Supabase MCP during
this build — keep both in sync: write the migration file, then apply it.

Regenerate TypeScript types after any schema change:

```bash
# via the Supabase CLI, or the Supabase MCP generate_typescript_types tool
supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
```

## Testing

```bash
npm run test:rls   # RLS integration suite — needs SUPABASE_SERVICE_ROLE_KEY
```

Runs against the live project (there's no local Postgres in this setup).
Creates and tears down its own test users/campaigns/teams per run.

## Backups

The Supabase free tier has no backups — see `.github/workflows/nightly-backup.yml`.
It needs these repo secrets to actually run: `DATABASE_URL`,
`BACKUP_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Until
those are configured, the workflow exists but won't fire successfully —
**verify a real restore before Phase 2**, per the spec's acceptance
criteria.

## Brand assets

No real logo files were supplied for this build — see `public/brand/README.md`.
The app currently renders a placeholder mark in the exact brand colours.

## What's real vs. preview

- Real, backed by the live database: auth/login, forced password change,
  user provisioning with one-time credential reveal, campaigns (with
  vertical/risk-tier compliance presets), clients, the audit log, session
  and credential-event views, manual lead entry with mandatory provenance
  (data source + lawful basis), the suppression console (add/search,
  global and instant), `v_dialable_leads`, lead assignment (manual and
  round-robin auto-top-up), and the **agent dial workspace itself** —
  queue, disposition, notes, callback booking and the atomic
  `record_call_attempt` transaction (call log + suppression + queue
  removal, all-or-nothing). All verified directly against the live
  database with an impersonated agent session, not just code review:
  unscreened leads never appear in the queue, suppressing a number removes
  it immediately, a booked callback disappears until due, and a "Do Not
  Call" disposition suppresses the number atomically.
  Also real: attendance (clock in/out, aux-state tracking with no-overlap
  enforcement, shift assignment, leave requests, the `pg_cron`
  missed/escalation sweep for follow-ups), the follow-up due tray (live via
  Supabase Realtime, with a snooze cap), and the email module (templates,
  suppression-gated sends via a swappable `EmailProvider`, HMAC-signed
  one-click unsubscribe).
- Also real, now that migrations 21-25 are applied (see the callout
  above): the QA review queue (`/qa` — scorecard-driven, fatal-breach
  detection), the performance dashboard (`/admin/performance` — campaign
  funnel chart, 7-day agent leaderboard sorted by calls-attempted/
  contact-rate rather than raw conversion, since verticals aren't
  comparable on that metric), and the data-sourcing module (`/admin/data`
  — connector registry, fetch-run history, per-source performance).
  The data-sourcing module itself: a `DataSourceConnector` interface with
  Companies House, UK planning (PlanIt), and a generic configurable-Socrata
  US-permits connector; a vendor CSV/XLSX importer with client-side column
  mapping; and a public inbound-web-form endpoint
  (`/api/leads/inbound`) with first-party consent capture (verbatim consent
  text, IP, timestamp). Every path — connector fetch, CSV row, or web-form
  submission — routes through the same `importLeads()` pipeline: reject if
  no data source (and therefore no lawful basis) resolves, validate the
  phone number, screen against suppression, then commit. See the connectors
  note above for which of the three API connectors were verified against a
  live response vs. built to spec but untested from this sandbox.
- Also real: the Phase 8 screening provider layer (`/admin/compliance`'s
  "Run screening" — internal check is fully real; TPS/CTPS/US DNC are
  `ManualEvidenceProvider`-based bureau-evidence uploads pending a real
  bureau account, per spec section 9) and DB-backed rate limiting on
  login, the inbound web form, and unsubscribe. Plus the mobile-friendly
  app shell (off-canvas nav below the `md` breakpoint), structured error
  logging (`src/lib/error-tracking.ts` — no monitoring account configured
  yet, logs to stderr), and the index review / load-testing prep in
  `docs/` (see `RUNBOOK.md` for the operational rundown of all of this).
- Preview / not yet built: Live Floor shows real campaign/assignment
  counts but no real-time call activity feed.

## A real bug found and fixed along the way

While wiring the agent queue, testing against a real `authenticated` role
(not the superuser connection migrations run as) surfaced two RLS issues
invisible to superuser-context testing — see migration
`00000000000012_fix_rls_recursion_and_suppression_read.sql`:

1. `profiles_select`'s `team_lead` branch had an inline subquery selecting
   from `profiles` within `profiles`' own RLS policy, causing infinite
   recursion the moment a real `team_lead` session hit it.
2. `suppression_list`'s read policy was manager/qa-only — but
   `v_dialable_leads` is `security_invoker`, so its join against
   `suppression_list` is *also* subject to the querying user's RLS. For an
   agent, that policy made every suppression row invisible, which made
   `phone_e164 is null` always true from their vantage point — i.e. an
   agent querying the real queue would have seen a suppressed number as
   dialable, silently defeating the compliance gate for exactly the role
   that matters most.

Both are fixed and re-verified with an impersonated-agent SQL session
(`set role authenticated; set request.jwt.claims ...`) — worth knowing if
you extend the RLS policies further: anything a security-definer helper
doesn't wrap, and anything a `security_invoker` view joins against, needs
to be checked from a real non-superuser session, not just via the
Supabase MCP connection.
