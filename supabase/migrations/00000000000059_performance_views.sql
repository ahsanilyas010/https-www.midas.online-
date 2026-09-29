-- Phase 6, migration 1 of 3 — performance views (spec: "Build as Postgres
-- views"). Both are security_invoker so they only ever show a caller what
-- their own RLS already permits — a client sees only their campaign's
-- funnel row, never another workspace's.

alter table calls add column answered_at timestamptz;
-- Set by record_call_attempt() (migration 060) when the disposition is
-- recorded — distinct from ended_at (when the Twilio call itself hung up)
-- so wrap-up time (disposed_at - ended_at) can be measured separately
-- from talk time (ended_at - answered_at).
alter table calls add column disposed_at timestamptz;

create or replace view v_campaign_funnel with (security_invoker = true) as
select
  c.workspace_id,
  c.id as campaign_id,
  c.name as campaign_name,
  count(distinct l.id) as loaded,
  count(distinct l.id) filter (where l.screening_status = 'passed') as screened,
  count(distinct l.id) filter (where l.attempts > 0) as dialled,
  count(distinct l.id) filter (where exists (
    select 1 from calls cl join dispositions d on d.id = cl.disposition_id
    where cl.lead_id = l.id and d.outcome_group in ('connect', 'conversion')
  )) as connected,
  count(distinct l.id) filter (where exists (
    select 1 from calls cl join dispositions d on d.id = cl.disposition_id
    where cl.lead_id = l.id and d.outcome_group = 'conversion'
  )) as converted
from campaigns c
left join leads l on l.campaign_id = c.id
group by c.workspace_id, c.id, c.name;

create or replace view v_agent_scorecard with (security_invoker = true) as
select
  ca.workspace_id,
  ca.agent_id,
  p.full_name as agent_name,
  count(*) as calls,
  count(*) filter (where d.outcome_group in ('connect', 'conversion')) as connects,
  count(*) filter (where d.outcome_group = 'conversion') as conversions,
  coalesce(sum(extract(epoch from (ca.ended_at - ca.answered_at))) filter (where ca.answered_at is not null and ca.ended_at is not null), 0)::bigint as talk_seconds,
  coalesce(avg(extract(epoch from (ca.disposed_at - ca.ended_at))) filter (where ca.disposed_at is not null and ca.ended_at is not null), 0)::int as avg_wrap_seconds
from calls ca
join profiles p on p.id = ca.agent_id
left join dispositions d on d.id = ca.disposition_id
group by ca.workspace_id, ca.agent_id, p.full_name;

grant select on v_campaign_funnel, v_agent_scorecard to authenticated;
