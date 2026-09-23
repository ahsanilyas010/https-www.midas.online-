-- Phase 8 — index review. See docs/index-review.md for the full
-- methodology (this environment's outbound network policy blocked the
-- Supabase MCP connection for large stretches of this build, so this is a
-- static review against actual query patterns in the codebase rather than
-- EXPLAIN ANALYZE against a populated table — flagged clearly in that
-- doc). Two concrete gaps found:

-- 1. getCallsNeedingReview() (src/lib/actions/qa.ts) does
-- `order by started_at desc limit 30` with no other filter reliably
-- narrowing the scan. Every existing call_attempts index is composite
-- with agent_id or lead_id leading, neither of which helps a plain
-- recency scan across all agents.
create index call_attempts_started_idx on call_attempts (started_at desc);

-- 2. v_source_performance (migration 23) left-joins leads to data_sources
-- on data_source_id, then groups by data_source, for every source's
-- entire lead history. No index covered that join column.
create index leads_data_source_idx on leads (data_source_id);
