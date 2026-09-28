-- Client-facing agent activity: D&P Brothers (and any future client) is
-- paying for agent time on their campaign, not just lead outcomes, so the
-- client dashboard needs a day-by-day view of hours worked and call
-- activity. Same aggregate-only, self-scoping shape as get_client_funnel
-- (migration 27) / get_client_dispositions (migration 28) — a
-- client_viewer never sees which agent did the work, only totals per day,
-- so this adds visibility without touching the existing "no agent
-- identity to clients" boundary.
--
-- Known simplification: attendance_sessions is per-user-per-day, not
-- per-campaign, so "attendance minutes" here is the total clocked-in time
-- of every agent assigned to this client's campaign(s) that day. If an
-- agent ever splits a day across campaigns for different clients, each
-- of those clients' reports would show that agent's whole-day hours, not
-- just their share. Correct today (one agent, one campaign, one client);
-- would need real per-campaign time tracking to hold if that changes.

create type client_agent_activity_row as (
  day date,
  agents_active bigint,
  calls_attempted bigint,
  connects bigint,
  talk_minutes numeric,
  wrap_minutes numeric,
  attendance_minutes numeric,
  productive_minutes numeric
);

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
        coalesce(sum(worked_minutes), 0) as attendance_minutes,
        coalesce(sum(productive_minutes), 0) as productive_minutes
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
