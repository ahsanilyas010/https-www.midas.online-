# Index review (Phase 8)

Spec section 7: "Index review with `EXPLAIN ANALYZE` on every list query."

## What this actually is

`EXPLAIN ANALYZE` on a near-empty database tells you almost nothing — a
sequential scan over a few hundred rows and an index scan both come back
in under a millisecond, so the planner's choice either way is not evidence
of anything at the volume the spec is actually worried about (500k leads,
2M call attempts). Running it for real needs that data loaded first (see
`docs/load-testing.md`), which was deliberately not done against the live
project without checking with the operator first — see that doc for why.

What follows instead is a static review: every `create index` across the
migrations, cross-referenced against the actual `.select()`/`.from()`
calls in `src/lib/actions/*.ts` and the views/RPCs, to catch a query with
no supporting index at all before it becomes a production incident. Two
were found and fixed in migration 25. Re-run the real `EXPLAIN ANALYZE`
version of this review once either (a) the load test in
`docs/load-testing.md` has been run, or (b) the app has enough real
traffic for `pg_stat_statements` to show actual slow queries — better
signal than a synthetic pass either way.

## Index inventory vs. query patterns

| Table | Index | Query pattern it serves |
|---|---|---|
| `leads` | `leads_queue_idx (campaign_id, status, screening_status, next_action_at)` | `v_dialable_leads` — the dial queue itself |
| `leads` | `leads_assigned_idx (assigned_to, status)` | agent's own queue, `leads_select` RLS |
| `leads` | `leads_campaign_phone_uniq (campaign_id, phone_e164)` | dedup on import, `record_call_attempt` |
| `leads` | `leads_phone_idx (phone_e164)` | suppression checks, manual lookup |
| `leads` | `leads_search_idx` (gin tsvector) | lead search box |
| `leads` | `leads_data_source_idx (data_source_id)` **[added, migration 25]** | `v_source_performance`'s join |
| `call_attempts` | `call_attempts_agent_day_idx (agent_id, started_at)` | agent scorecard rollup, QA-by-agent |
| `call_attempts` | `call_attempts_lead_idx (lead_id, started_at desc)` | lead detail / call history |
| `call_attempts` | `call_attempts_started_idx (started_at desc)` **[added, migration 25]** | `getCallsNeedingReview()` — QA queue's recency scan |
| `followups` | `followups_due_idx (assigned_to, status, due_at)` | the follow-up tray, `sweep_followups()` |
| `qa_reviews` | `qa_reviews_agent_idx`, `qa_reviews_call_idx` | agent's review history, per-call lookup |
| `source_fetch_runs` | `source_fetch_runs_source_idx (data_source_id, started_at desc)` | fetch history table |
| `suppression_list` | PK on `phone_e164` | every screening check — the hottest lookup in the system |
| `attendance_sessions`, `shift_assignments`, `leave_requests` | user+date composites | attendance widgets, admin attendance page |

## A known scaling issue this review found but did not fix

`getCallsNeedingReview()` (`src/lib/actions/qa.ts`) fetches every already-
reviewed `call_attempt_id` into memory, then does
`.not("id", "in", "(...)")` against `call_attempts`. That's fine at
hundreds of reviews; at hundreds of thousands it becomes a multi-megabyte
`IN` clause and a real problem, independent of indexing — no index makes a
list-of-a-million-UUIDs filter fast. The correct fix at that scale is a
`left join qa_reviews ... where qa_reviews.id is null` (or a
`reviewed_at` column directly on `call_attempts`, denormalised for exactly
this query), not another index. Left as a known item rather than a
speculative rewrite of working code with no data volume to test it against.

## Indexes considered and deliberately not added

- A partial index on `leads (campaign_id, status, screening_status,
  next_action_at) where not do_not_call` — `leads_queue_idx` already
  covers the same columns; a partial variant might shrink it usefully once
  `do_not_call` is a meaningful fraction of the table, but that's not
  measurable without real data, and an unnecessary index has a real
  write-amplification cost on every lead insert/update. Revisit with
  `EXPLAIN ANALYZE` once there's a populated table to test against.
- Extra indexes on `mv_agent_scorecard_daily` beyond its existing unique
  index — one row per agent/campaign/day keeps this small regardless of
  `call_attempts` volume; not a target for this review.
