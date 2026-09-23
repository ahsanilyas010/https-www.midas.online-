# Load testing (Phase 8)

Spec section 7: "Load test with 500k leads and 2M call attempts."

## Why this hasn't been run yet

This is a **write once, hard to undo, shared-database** action, and the
numbers don't fit the current environment comfortably enough to run it
without checking first:

The spec's own cost-reality note (section 1) says the Supabase free tier
gives 500 MB of Postgres storage, and that "500 MB is enough for roughly
300k–600k lean lead rows plus their call history." The requested load test
— 500k leads **and** 2M call attempts, each call attempt row with its own
overhead (disposition, notes, timestamps, indexes) — is very plausibly
enough on its own to fill or exceed the entire free-tier database. That
project is the one this whole build has been running against; it may hold
real configuration (users, campaigns, real test fixtures) that a
near-fill event puts at risk, on a tier with **no backups**
(same section — "no backups is the real problem... losing it is a
business-ending event").

Given that, generating this data was left for the operator to trigger
deliberately, not run automatically mid-build. `scripts/load-test-seed.sql`
below is ready to go.

## How to actually run it

**Do this on a disposable target, not the primary project**, using
whichever of these is available:

1. **A Supabase branch** (`create_branch` MCP tool, or the CLI) off the
   main project — isolated compute/storage, cheap to throw away, real
   Postgres so `EXPLAIN ANALYZE` results transfer directly.
2. **A second, throwaway Supabase project** on the free tier, with this
   repo's migrations applied fresh.
3. If truly comfortable running it against the primary project (e.g.
   already upgraded to Pro per the spec's own recommendation, or the
   project genuinely has no real data yet) — do it there, but confirm the
   plan/storage headroom first (`get_project` / dashboard).

```bash
psql "$DATABASE_URL" -f scripts/load-test-seed.sql
```

The script is idempotent-ish (uses `generate_series` against existing
campaigns/agents, checks row counts before inserting) but is still a
large, slow write — expect it to take real time and to want to run it
somewhere you can afford to just drop the database afterward.

## What to check once it's loaded

```sql
explain analyze select * from v_dialable_leads where campaign_id = '<id>' limit 50;
explain analyze select * from leads where campaign_id = '<id>' and status = 'new' order by next_action_at limit 50;
explain analyze select * from call_attempts where agent_id = '<id>' order by started_at desc limit 50;
explain analyze select * from followups where assigned_to = '<id>' and status = 'pending' order by due_at limit 50;
```

Look for `Seq Scan` on any of these at this volume — that's the signal
`docs/index-review.md` couldn't produce without real data. Compare against
the index inventory there and add whatever's missing.

## Cleanup

Drop the branch/throwaway project. Do not leave 2.5M synthetic rows in
anything that isn't disposable.
