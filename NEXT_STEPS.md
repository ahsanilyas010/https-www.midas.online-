# Next steps — manual/setup work

A prompt for a Cowork/Claude Code session (ideally one with working Supabase
MCP access, or run locally where real credentials can be entered) to finish
the parts of this build that needed real accounts, secrets, or manual
verification rather than code. Copy the block below into a fresh session.

---

```
I'm finishing the ABPO Command build (repo: ahsanilyas010/callingcrm, branch:
claude/frontend-animation-skills-b6aog4, PR #1). All 8 phases of the spec
(plan_crm.md) are code-complete and pushed. What's left is setup/ops work
that needed real credentials or manual execution, which a prior sandboxed
session couldn't do. Work through this checklist in order, checking off each
item, and ask me for credentials/decisions where marked [ASK ME].

## 1. Apply the pending migrations
Migrations 00000000000021 through 00000000000025 in supabase/migrations/
are written but never applied to the live Supabase project
(project_id uvgekzergvtbvvhvuyyh). Apply them in order via the Supabase
MCP `apply_migration` tool (or `supabase db push` / the dashboard SQL
editor if MCP still won't cooperate). After they're applied:
- Regenerate src/lib/supabase/types.ts for real
  (`supabase gen types typescript --project-id uvgekzergvtbvvhvuyyh`)
- Diff it against the current hand-written version and confirm nothing
  was guessed wrong (qa_scorecards, qa_reviews, v_campaign_funnel,
  get_agent_scorecard, v_source_performance, source_fetch_runs,
  check_rate_limit — see the README's migration callout for the full list)
- Run `npm run build` to confirm it's clean

## 2. Environment / secrets [ASK ME for each]
- SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API
- COMPANIES_HOUSE_API_KEY — free registration at Companies House developer hub
- RESEND_API_KEY + a verified sending domain for EMAIL_FROM_DOMAIN
- TPS_BUREAU_API_KEY / TPS_BUREAU_ENDPOINT — only once a bureau account exists
- US_DNC_SAN / US_DNC_ORG_ID — only once a DNC.gov subscription exists
- UNSUBSCRIBE_SECRET — generate a random value if not already set
Set these in .env.local for local dev and in the hosting platform's env vars.

## 3. Bootstrap and verify
- Run `npm run bootstrap-admin -- --email <you> --name "<name>"` to create
  the first super_admin
- Log in for real, go through forced password change
- Click through every role's main screens (agent workspace, admin
  campaigns/people/compliance/data/performance, QA queue) and confirm
  nothing 500s now that the schema is fully applied
- Run `npm run test:rls` (needs SUPABASE_SERVICE_ROLE_KEY)

## 4. Verify the two connectors that couldn't be checked before
UK planning (src/lib/connectors/uk-planning.ts, via planit.org.uk) and US
permits (src/lib/connectors/us-permits.ts, generic Socrata) were built
against documented API shapes but never hit a live endpoint — the build
sandbox's network policy blocked it. From admin/data:
- Register a UK planning connector source, run a small test fetch, check
  the field mapping in the code actually matches what comes back
- Pick a real US city's Socrata building-permits dataset, set its
  domain/datasetId/fieldMap in a data source's config, run a test fetch
Fix any field-name mismatches you find.

## 5. Backups
`.github/workflows/nightly-backup.yml` needs six repo secrets (see the
workflow file's header comment): DATABASE_URL, BACKUP_ENCRYPTION_KEY,
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_S3_BUCKET,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY. [ASK ME for AWS/S3 details if
we're using them.] Set them, trigger the workflow manually once, then
actually restore the resulting dump into a scratch database and verify
row counts — this has never been tested end-to-end and the spec calls
that out as mandatory before going live.

## 6. Load test (optional, do NOT skip the safety check)
Read docs/load-testing.md first. The spec wants 500k leads / 2M call
attempts, which could fill a free-tier Supabase project's entire 500MB
with no backups behind it. [ASK ME] whether to run
scripts/load-test-seed.sql against a disposable Supabase branch (safe) or
the primary project (only if already on a paid plan with headroom). Then
re-run the EXPLAIN ANALYZE queries in that doc against real volume and
compare to docs/index-review.md's findings.

## 7. Brand and hosting [ASK ME]
- Real logo files (see public/brand/README.md — currently a placeholder)
- Which host to deploy to (Vercel is the obvious default) and get it live
- Whether to wire a real error-tracking provider (src/lib/error-tracking.ts
  has the extension point documented; needs a DSN)

## 8. Ship it
Once the above is done, mark PR #1 ready for review (it's currently
draft) and merge it.

Work through these in order. Stop and ask me explicitly before anything
that spends money, touches production data, or needs a credential I
haven't given you.
```
