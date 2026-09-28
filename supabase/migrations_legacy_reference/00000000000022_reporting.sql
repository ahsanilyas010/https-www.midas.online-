-- Section 6.6 — reporting. Built as views/materialised rollups so
-- dashboards stay fast as call_attempts grows, per the spec.

-- Campaign funnel: security_invoker so RLS on leads still scopes results
-- per caller (managers see everything, an agent querying this directly
-- would only ever see their own assigned subset — safe by construction,
-- same pattern as v_dialable_leads).
create or replace view v_campaign_funnel
with (security_invoker = true) as
select
  campaign_id,
  count(*) as loaded,
  count(*) filter (where screening_status = 'passed') as screened_passed,
  count(*) filter (where screening_status = 'passed' and not do_not_call
                    and status not in ('converted', 'rejected', 'suppressed', 'unreachable')) as dialable,
  count(*) filter (where attempt_count > 0) as worked,
  count(*) filter (where status in ('contacted', 'qualified', 'converted')) as contacted,
  count(*) filter (where status = 'qualified') as qualified,
  count(*) filter (where status = 'converted') as converted
from leads
group by campaign_id;

-- Agent scorecard: a materialised view, refreshed nightly by pg_cron.
-- Materialised views can't carry RLS (Postgres has no per-row security on
-- them), so direct table access is revoked entirely and the only path in
-- is get_agent_scorecard(), which checks the caller's role itself.
create materialized view mv_agent_scorecard_daily as
select
  ca.agent_id,
  ca.campaign_id,
  date(ca.started_at) as day,
  count(*) as calls_attempted,
  count(distinct ca.lead_id) as unique_leads_touched,
  count(*) filter (where d.category like 'connected%') as connects,
  count(*) filter (where d.code = 'connected_interested') as conversions,
  coalesce(sum(ca.talk_seconds), 0) as talk_seconds,
  coalesce(avg(ca.talk_seconds) filter (where ca.talk_seconds is not null), 0) as avg_talk_seconds,
  coalesce(avg(ca.wrap_seconds) filter (where ca.wrap_seconds is not null), 0) as avg_wrap_seconds
from call_attempts ca
left join dispositions d on d.id = ca.disposition_id
group by ca.agent_id, ca.campaign_id, date(ca.started_at));

create unique index mv_agent_scorecard_daily_uniq
  on mv_agent_scorecard_daily (agent_id, campaign_id, day);

revoke all on mv_agent_scorecard_daily from public, anon, authenticated;

create or replace function refresh_agent_scorecard() returns void
language sql security definer set search_path = public as $$
  refresh materialized view concurrently mv_agent_scorecard_daily;
$$;
revoke execute on function refresh_agent_scorecard() from public, anon, authenticated;

select cron.schedule('refresh-agent-scorecard', '5 0 * * *', 'select refresh_agent_scorecard();');

-- Row type for get_agent_scorecard's return — mirrors the materialised
-- view's columns since RETURNS SETOF <matview> against a matview with all
-- privileges revoked isn't queryable from outside this function anyway.
create type agent_scorecard_row as (
  agent_id uuid,
  campaign_id uuid,
  day date,
  calls_attempted bigint,
  unique_leads_touched bigint,
  connects bigint,
  conversions bigint,
  talk_seconds numeric,
  avg_talk_seconds numeric,
  avg_wrap_seconds numeric
);

create or replace function get_agent_scorecard(p_from date, p_to date, p_campaign_id uuid default null)
returns setof agent_scorecard_row
language plpgsql security definer set search_path = public as $$
begin
  if is_manager() then
    return query
      select agent_id, campaign_id, day, calls_attempted, unique_leads_touched,
             connects, conversions, talk_seconds, avg_talk_seconds, avg_wrap_seconds
      from mv_agent_scorecard_daily
      where day between p_from and p_to
        and (p_campaign_id is null or campaign_id = p_campaign_id);
  elsif auth_role() = 'team_lead' then
    return query
      select agent_id, campaign_id, day, calls_attempted, unique_leads_touched,
             connects, conversions, talk_seconds, avg_talk_seconds, avg_wrap_seconds
      from mv_agent_scorecard_daily
      where day between p_from and p_to
        and (p_campaign_id is null or campaign_id = p_campaign_id)
        and agent_id in (select my_team_members());
  elsif auth_role() = 'agent' then
    return query
      select agent_id, campaign_id, day, calls_attempted, unique_leads_touched,
             connects, conversions, talk_seconds, avg_talk_seconds, avg_wrap_seconds
      from mv_agent_scorecard_daily
      where day between p_from and p_to
        and (p_campaign_id is null or campaign_id = p_campaign_id)
        and agent_id = auth.uid();
  else
    raise exception 'not authorized';
  end if;
end;
$$;

revoke execute on function get_agent_scorecard(date, date, uuid) from public, anon;
grant execute on function get_agent_scorecard(date, date, uuid) to authenticated;

grant select on v_campaign_funnel to authenticated;
