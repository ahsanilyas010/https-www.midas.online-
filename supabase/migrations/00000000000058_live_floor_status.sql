-- Phase 5, migration 3 of 3 — computes each staff member's live-floor
-- status (available / on_call / break / wrap_up / offline) on demand
-- rather than storing it, so it's always consistent with the underlying
-- attendance_events/calls/leads rows. security invoker (not definer) —
-- it should see exactly what the calling role's RLS already allows, same
-- as any other query a manager or team_lead runs.

create or replace function workspace_live_status() returns table (
  user_id uuid,
  full_name text,
  role app_role,
  status text,
  call_started_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  with latest_event as (
    select distinct on (ae.user_id) ae.user_id, ae.event_type
    from attendance_events ae
    where ae.workspace_id = auth_workspace_id()
    order by ae.user_id, ae.occurred_at desc
  ),
  active_call as (
    select distinct on (c.agent_id) c.agent_id, c.started_at
    from calls c
    where c.workspace_id = auth_workspace_id()
      and c.status in ('initiated', 'ringing', 'in-progress')
      and c.ended_at is null
    order by c.agent_id, c.started_at desc
  ),
  wrap_up as (
    select distinct l.claimed_by as agent_id
    from leads l
    where l.workspace_id = auth_workspace_id()
      and l.claimed_by is not null
      and exists (
        select 1 from calls c
        where c.lead_id = l.id and c.agent_id = l.claimed_by and c.ended_at is not null
      )
  )
  select
    p.id,
    p.full_name,
    p.role,
    case
      when ac.agent_id is not null then 'on_call'
      when wu.agent_id is not null then 'wrap_up'
      when le.event_type = 'break_start' then 'break'
      when le.event_type = 'clock_in' then 'available'
      else 'offline'
    end as status,
    ac.started_at
  from profiles p
  left join latest_event le on le.user_id = p.id
  left join active_call ac on ac.agent_id = p.id
  left join wrap_up wu on wu.agent_id = p.id
  where p.workspace_id = auth_workspace_id()
    and p.role in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
    and p.is_active
$$;

revoke execute on function workspace_live_status() from public, anon;
grant execute on function workspace_live_status() to authenticated;

-- Today's headline numbers for the live floor: calls, connects,
-- conversions, contact rate — scoped to the caller's own workspace via
-- the same auth_workspace_id() helper, invoker rights so RLS still
-- governs what the caller can see.
create or replace function workspace_today_stats() returns table (
  calls_today bigint,
  connects_today bigint,
  conversions_today bigint
)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where c.created_at >= date_trunc('day', now())) as calls_today,
    count(*) filter (where c.created_at >= date_trunc('day', now()) and d.outcome_group in ('connect', 'conversion')) as connects_today,
    count(*) filter (where c.created_at >= date_trunc('day', now()) and d.outcome_group = 'conversion') as conversions_today
  from calls c
  left join dispositions d on d.id = c.disposition_id
  where c.workspace_id = auth_workspace_id()
$$;

revoke execute on function workspace_today_stats() from public, anon;
grant execute on function workspace_today_stats() to authenticated;
