-- Slice B, migration 3 of 5 - lead assignment and single-lead screening.
-- All three are manager-only SECURITY DEFINER functions that scope every
-- statement to the caller's own workspace.

-- Round-robin top-up: gives each rostered agent enough unassigned,
-- screened-and-passed leads from this campaign to reach their
-- daily_target of open leads (status assigned / contacted). Suppressed
-- numbers are never handed out. Returns how many leads were assigned.
create or replace function auto_assign_campaign_leads(p_campaign_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_count int;
begin
  if not is_workspace_manager() then
    raise exception 'only a workspace manager can assign leads';
  end if;
  if not exists (select 1 from campaigns where id = p_campaign_id and workspace_id = v_ws) then
    raise exception 'campaign not found';
  end if;

  with roster as (
    select
      ca.user_id,
      row_number() over (order by ca.created_at, ca.user_id) as ord,
      greatest(
        ca.daily_target - (
          select count(*) from leads l
          where l.campaign_id = p_campaign_id and l.assigned_to = ca.user_id
            and l.status in ('assigned', 'contacted')
        ),
        0
      )::int as need
    from campaign_assignments ca
    join profiles p on p.id = ca.user_id and p.is_active
    where ca.campaign_id = p_campaign_id and ca.workspace_id = v_ws
  ),
  slots as (
    select r.user_id, r.ord, k
    from roster r, lateral generate_series(1, r.need) as k
  ),
  ranked_slots as (
    select user_id, row_number() over (order by k, ord) as rn from slots
  ),
  pool as (
    select l.id, row_number() over (order by l.created_at, l.id) as rn
    from leads l
    where l.campaign_id = p_campaign_id
      and l.workspace_id = v_ws
      and l.assigned_to is null
      and l.screening_status = 'passed'
      and not exists (
        select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = l.phone_hash
      )
  ),
  picks as (
    select pool.id, ranked_slots.user_id
    from pool join ranked_slots using (rn)
  )
  update leads l
  set assigned_to = picks.user_id
  from picks
  where l.id = picks.id and l.assigned_to is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function auto_assign_campaign_leads(uuid) from public, anon;
grant execute on function auto_assign_campaign_leads(uuid) to authenticated;

-- Takes an agent off a campaign roster. Leads of theirs that nobody has
-- worked yet (no dial attempts, still 'assigned') go back to the pool so
-- they are not stranded; worked leads stay with the agent.
create or replace function remove_agent_from_campaign(p_campaign_id uuid, p_user_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_released int;
begin
  if not is_workspace_manager() then
    raise exception 'only a workspace manager can change a campaign roster';
  end if;

  delete from campaign_assignments
  where campaign_id = p_campaign_id and user_id = p_user_id and workspace_id = v_ws;
  if not found then
    raise exception 'that agent is not on this campaign''s roster';
  end if;

  update leads
  set assigned_to = null
  where campaign_id = p_campaign_id and workspace_id = v_ws
    and assigned_to = p_user_id and attempts = 0 and status = 'assigned';
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;
revoke execute on function remove_agent_from_campaign(uuid, uuid) from public, anon;
grant execute on function remove_agent_from_campaign(uuid, uuid) to authenticated;

-- Single/multi-lead screening (the manual stub, same semantics as
-- screen_lead_batch): a lead whose number is on the suppression list is
-- marked failed and can never pass; anything else becomes passed. Returns
-- the number that passed.
create or replace function screen_leads(p_lead_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_passed int;
begin
  if not is_workspace_manager() then
    raise exception 'only a workspace manager can screen leads';
  end if;

  update leads l
  set screening_status = 'failed', screened_at = now()
  where l.id = any(p_lead_ids) and l.workspace_id = v_ws
    and l.screening_status <> 'passed'
    and exists (select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = l.phone_hash);

  update leads l
  set screening_status = 'passed', screened_at = now()
  where l.id = any(p_lead_ids) and l.workspace_id = v_ws
    and l.screening_status <> 'passed'
    and l.phone_e164 is not null
    and not exists (select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = l.phone_hash);
  get diagnostics v_passed = row_count;
  return v_passed;
end;
$$;
revoke execute on function screen_leads(uuid[]) from public, anon;
grant execute on function screen_leads(uuid[]) to authenticated;
