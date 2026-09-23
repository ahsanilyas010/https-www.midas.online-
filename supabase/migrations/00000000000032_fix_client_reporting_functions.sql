-- Fixes found verifying the D&P Brothers client login before handoff:
--
-- 1. get_client_agent_activity (migration 31) raised "structure of query
--    does not match function result type" and never returned a row.
--    attendance_agg summed worked_minutes/productive_minutes (bigint
--    columns on attendance_sessions) without casting to numeric, but
--    client_agent_activity_row declares both columns numeric — PL/pgSQL's
--    RETURN QUERY requires an exact type match per column, it does not
--    apply the implicit bigint->numeric cast Postgres allows elsewhere.
--    The client dashboard silently showed an empty "Agent activity"
--    section as a result (loadClientAgentActivity treats an RPC error as
--    zero rows rather than failing the page).
--
-- 2. get_client_dispositions (migration 28) was never actually applied to
--    this project — its type/function don't exist in the live database
--    despite being committed to the repo, so any call to it errors and
--    (per loadClientFunnel bundling both RPCs into one outcome) takes the
--    entire /client page down with it, not just a dispositions section.
--    Recreated here verbatim from migration 28, guarded so this migration
--    is safe to run whether or not 28 ever landed.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'client_disposition_row') then
    create type client_disposition_row as (
      campaign_id uuid,
      campaign_name text,
      campaign_code text,
      disposition_code text,
      disposition_label text,
      category text,
      attempts bigint
    );
  end if;
end
$$;

create or replace function get_client_dispositions(p_client_id uuid default null)
returns setof client_disposition_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null then
      return;
    end if;
  elsif is_manager() then
    v_client_id := p_client_id;
  else
    raise exception 'not authorized';
  end if;

  return query
    select
      c.id,
      c.name,
      c.code,
      d.code,
      d.label,
      d.category,
      count(ca.id) as attempts
    from campaigns c
    join call_attempts ca on ca.campaign_id = c.id
    join dispositions d on d.id = ca.disposition_id
    where (v_client_id is null or c.client_id = v_client_id)
    group by c.id, c.name, c.code, d.code, d.label, d.category, d.sort_order
    order by c.name, d.sort_order;
end;
$$;

revoke execute on function get_client_dispositions(uuid) from public, anon;
grant execute on function get_client_dispositions(uuid) to authenticated;

create or replace function get_client_agent_activity(
  p_client_id uuid default null,
  p_from date default null,
  p_to date default null
) returns setof client_agent_activity_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
  v_from date := coalesce(p_from, current_date - 30);
  v_to date := coalesce(p_to, current_date);
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null then
      return; -- account has no client linked yet: nothing to show, not an error
    end if;
  elsif is_manager() then
    v_client_id := p_client_id; -- null = every client
  else
    raise exception 'not authorized';
  end if;

  return query
    with days as (
      select generate_series(v_from::timestamp, v_to::timestamp, interval '1 day')::date as day
    ),
    client_agents as (
      select distinct ca.user_id
      from campaign_assignments ca
      join campaigns c on c.id = ca.campaign_id
      where (v_client_id is null or c.client_id = v_client_id)
    ),
    call_days as (
      select
        date(ct.started_at) as day,
        ct.agent_id,
        ct.talk_seconds,
        ct.wrap_seconds,
        d.category
      from call_attempts ct
      join campaigns c on c.id = ct.campaign_id
      left join dispositions d on d.id = ct.disposition_id
      where (v_client_id is null or c.client_id = v_client_id)
        and date(ct.started_at) between v_from and v_to
    ),
    call_agg as (
      select
        day,
        count(distinct agent_id) as agents_active,
        count(*) as calls_attempted,
        count(*) filter (where category like 'connected%') as connects,
        coalesce(sum(talk_seconds), 0) / 60.0 as talk_minutes,
        coalesce(sum(wrap_seconds), 0) / 60.0 as wrap_minutes
      from call_days
      group by day
    ),
    attendance_agg as (
      select
        work_date as day,
        coalesce(sum(worked_minutes), 0)::numeric as attendance_minutes,
        coalesce(sum(productive_minutes), 0)::numeric as productive_minutes
      from attendance_sessions
      where user_id in (select user_id from client_agents)
        and work_date between v_from and v_to
      group by work_date
    )
    select
      dd.day,
      coalesce(ca.agents_active, 0),
      coalesce(ca.calls_attempted, 0),
      coalesce(ca.connects, 0),
      coalesce(ca.talk_minutes, 0),
      coalesce(ca.wrap_minutes, 0),
      coalesce(at.attendance_minutes, 0),
      coalesce(at.productive_minutes, 0)
    from days dd
    left join call_agg ca on ca.day = dd.day
    left join attendance_agg at on at.day = dd.day
    order by dd.day;
end;
$$;

revoke execute on function get_client_agent_activity(uuid, date, date) from public, anon;
grant execute on function get_client_agent_activity(uuid, date, date) to authenticated;
