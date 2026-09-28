-- Phase 2, migration 4 of 7 — the compliance gate. The Call button's only
-- path to a phone number: this function, never a direct `select * from
-- leads`. FOR UPDATE SKIP LOCKED means two agents calling this
-- concurrently never receive the same lead; the claimed_by/claimed_at
-- columns (migration 047) are what keeps that guarantee alive after the
-- transaction that made the claim commits and the row lock releases.
--
-- Every condition from the spec's COMPLIANCE GATE section, all in the
-- WHERE clause below:
--   screened_at is not null (screening_status = 'passed')
--   phone_hash not in suppression_list
--   attempts < campaign.max_attempts
--   now() falls inside the campaign calling window in the lead's local time
--   last_attempt_at is older than campaign.cooling_off_hours
--   if workspace.is_demo, phone is in DEMO_ALLOWED_NUMBERS
--
-- Two queues, due-now callbacks first (spec, Phase 4's DIAL WORKSPACE
-- section: "due-now wins") — implemented here, not just in the UI, since
-- the gate itself is where queue priority has to be enforced.

create or replace function next_lead_for_agent(p_agent_id uuid) returns leads
language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid;
  v_workspace workspaces;
  v_lead leads;
  v_claim_ttl constant interval := interval '10 minutes';
begin
  if p_agent_id is distinct from auth.uid() then
    raise exception 'agents can only pull their own next lead';
  end if;

  v_workspace_id := auth_workspace_id();
  select * into v_workspace from workspaces where id = v_workspace_id;

  -- Queue 1: a due-now callback assigned to this agent.
  select l.* into v_lead
  from callbacks cb
  join leads l on l.id = cb.lead_id
  join campaigns c on c.id = l.campaign_id
  where cb.workspace_id = v_workspace_id
    and cb.agent_id = p_agent_id
    and cb.status = 'pending'
    and cb.due_at <= now()
    and (l.claimed_by is null or l.claimed_at < now() - v_claim_ttl)
    and l.attempts < c.max_attempts
    and not exists (
      select 1 from suppression_list s where s.workspace_id = v_workspace_id and s.phone_hash = l.phone_hash
    )
    and (not v_workspace.is_demo or l.phone_e164 = any(v_workspace.demo_allowed_numbers))
  order by cb.due_at asc
  limit 1
  for update of l skip locked;

  if v_lead.id is not null then
    update leads set claimed_by = p_agent_id, claimed_at = now() where id = v_lead.id returning * into v_lead;
    return v_lead;
  end if;

  -- Queue 2: a fresh, dialable lead in one of this agent's campaigns.
  select l.* into v_lead
  from leads l
  join campaigns c on c.id = l.campaign_id
  join campaign_assignments ca on ca.campaign_id = c.id and ca.user_id = p_agent_id
  where l.workspace_id = v_workspace_id
    and c.status = 'active'
    and l.screening_status = 'passed'
    and l.screened_at is not null
    and (l.claimed_by is null or l.claimed_at < now() - v_claim_ttl)
    and l.attempts < c.max_attempts
    and (l.last_attempt_at is null or l.last_attempt_at < now() - (c.cooling_off_hours || ' hours')::interval)
    and (
      c.calling_window_start is null or c.calling_window_end is null
      or (now() at time zone coalesce(c.timezone, 'UTC'))::time between c.calling_window_start and c.calling_window_end
    )
    and not exists (
      select 1 from suppression_list s where s.workspace_id = v_workspace_id and s.phone_hash = l.phone_hash
    )
    and (not v_workspace.is_demo or l.phone_e164 = any(v_workspace.demo_allowed_numbers))
  order by l.created_at asc
  limit 1
  for update of l skip locked;

  if v_lead.id is null then
    return null;
  end if;

  update leads set claimed_by = p_agent_id, claimed_at = now() where id = v_lead.id returning * into v_lead;
  return v_lead;
end;
$$;

revoke execute on function next_lead_for_agent(uuid) from public, anon;
grant execute on function next_lead_for_agent(uuid) to authenticated;
