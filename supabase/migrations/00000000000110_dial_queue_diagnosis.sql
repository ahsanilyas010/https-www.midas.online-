-- Why is my dial queue empty? One row of counts that mirrors, condition by
-- condition, what next_lead_for_agent() (migration 71, untouched) requires
-- before it serves a fresh lead, so /dial can name the first real blocker
-- instead of a generic explanation. It reads nothing next_lead_for_agent does
-- not already read and returns only counts and campaign names the caller's own
-- roster already shows them; the caller is always auth.uid() in their own
-- workspace. Clocking in does not gate dialing and is deliberately absent.
--
-- Campaign checks (the caller's rostered campaigns):
--   rostered_campaigns      on the roster at all
--   active_campaigns        of those, status = 'active'
--   in_window_campaigns     of those, inside the calling window right now
--                           (computed in the campaign's own timezone, exactly
--                           as next_lead_for_agent does)
-- Lead checks, over the active campaigns that are inside their window, each
-- lead counted once under the FIRST thing that stops it being served:
--   pending_screening, failed_screening, expired_screening, assigned_elsewhere,
--   attempts_exhausted, suppressed, cooling_off, claimed (held by an unfinished
--   call, frees up in 10 minutes), demo_blocked (demo workspace allow-list),
--   dialable (nothing stops it: only non-zero in a race).
create or replace function dial_queue_diagnosis() returns table (
  is_demo boolean,
  rostered_campaigns int,
  active_campaigns int,
  in_window_campaigns int,
  paused_campaign_name text,
  outside_campaign_name text,
  outside_window_start text,
  outside_window_end text,
  outside_timezone text,
  leads_in_rostered_campaigns int,
  leads_considered int,
  pending_screening int,
  failed_screening int,
  expired_screening int,
  assigned_elsewhere int,
  attempts_exhausted int,
  suppressed int,
  cooling_off int,
  claimed int,
  demo_blocked int,
  dialable int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid := auth_workspace_id();
  v_ttl constant interval := interval '10 minutes';
  v_workspace workspaces;
begin
  if v_uid is null or v_ws is null then
    raise exception 'sign in to see why your queue is empty';
  end if;
  if auth_role() not in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst') then
    raise exception 'only staff who can dial can use this';
  end if;
  select * into v_workspace from workspaces where id = v_ws;

  return query
  with camp as (
    select c.id, c.name, c.status, c.max_attempts, c.cooling_off_hours, c.timezone,
           c.calling_window_start, c.calling_window_end,
           (
             c.calling_window_start is null or c.calling_window_end is null
             or (now() at time zone coalesce(c.timezone, 'UTC'))::time between c.calling_window_start and c.calling_window_end
           ) as in_window
    from campaigns c
    join campaign_assignments ca on ca.campaign_id = c.id and ca.user_id = v_uid
    where c.workspace_id = v_ws
  ),
  servable as (
    select * from camp where status = 'active' and in_window
  ),
  state as (
    select case
      when l.screening_status = 'failed' then 'failed'
      when l.screening_status = 'expired' then 'expired'
      when l.screening_status <> 'passed' or l.screened_at is null then 'pending'
      when l.assigned_to is not null and l.assigned_to <> v_uid then 'elsewhere'
      when l.attempts >= s.max_attempts then 'exhausted'
      when exists (select 1 from suppression_list sl where sl.workspace_id = v_ws and sl.phone_hash = l.phone_hash) then 'suppressed'
      when l.last_attempt_at is not null and l.last_attempt_at >= now() - (s.cooling_off_hours || ' hours')::interval then 'cooling'
      when l.claimed_by is not null and l.claimed_at >= now() - v_ttl then 'claimed'
      when v_workspace.is_demo and not (l.phone_e164 = any(v_workspace.demo_allowed_numbers)) then 'demo'
      else 'dialable'
    end as kind
    from leads l
    join servable s on s.id = l.campaign_id
    where l.workspace_id = v_ws
  )
  select
    v_workspace.is_demo,
    (select count(*)::int from camp),
    (select count(*)::int from camp where status = 'active'),
    (select count(*)::int from servable),
    (select name from camp where status = 'paused' order by name limit 1),
    (select name from camp where status = 'active' and not in_window order by name limit 1),
    (select to_char(calling_window_start, 'HH24:MI') from camp where status = 'active' and not in_window order by name limit 1),
    (select to_char(calling_window_end, 'HH24:MI') from camp where status = 'active' and not in_window order by name limit 1),
    (select timezone from camp where status = 'active' and not in_window order by name limit 1),
    (select count(*)::int from leads l join camp c on c.id = l.campaign_id where l.workspace_id = v_ws),
    (select count(*)::int from state),
    (select count(*)::int from state where kind = 'pending'),
    (select count(*)::int from state where kind = 'failed'),
    (select count(*)::int from state where kind = 'expired'),
    (select count(*)::int from state where kind = 'elsewhere'),
    (select count(*)::int from state where kind = 'exhausted'),
    (select count(*)::int from state where kind = 'suppressed'),
    (select count(*)::int from state where kind = 'cooling'),
    (select count(*)::int from state where kind = 'claimed'),
    (select count(*)::int from state where kind = 'demo'),
    (select count(*)::int from state where kind = 'dialable');
end;
$$;

revoke execute on function dial_queue_diagnosis() from public, anon;
grant execute on function dial_queue_diagnosis() to authenticated;
