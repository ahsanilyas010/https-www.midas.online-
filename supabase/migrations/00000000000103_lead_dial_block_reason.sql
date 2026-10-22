-- Call sheet, part 1: one place that answers "can this agent dial this lead
-- right now, and if not, why?". It applies the SAME conditions as the queue in
-- next_lead_for_agent() (migration 71, queue 2) and adds the workspace-suspended
-- check that startCall() makes, then returns a short human reason. NULL means
-- dialable. It only evaluates for the signed-in user (p_agent_id must be
-- auth.uid()) and only for leads in their workspace. next_lead_for_agent() is
-- not modified.
create or replace function lead_dial_block_reason(p_lead_id uuid, p_agent_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_claim_ttl constant interval := interval '10 minutes';
  v_workspace_id uuid := auth_workspace_id();
  v_workspace workspaces;
  v_lead leads;
  v_c campaigns;
  v_tz text;
  v_until timestamptz;
begin
  if p_agent_id is distinct from auth.uid() then
    raise exception 'You can only check your own dialability.';
  end if;

  select * into v_lead from leads where id = p_lead_id and workspace_id = v_workspace_id;
  if v_lead.id is null then
    return 'Lead not found';
  end if;

  select * into v_workspace from workspaces where id = v_workspace_id;
  if v_workspace.status = 'suspended' then
    return 'Workspace is suspended';
  end if;

  if v_lead.phone_e164 is null or btrim(v_lead.phone_e164) = '' then
    return 'No phone number yet';
  end if;

  if v_lead.campaign_id is null then
    return 'Not on a campaign';
  end if;
  select * into v_c from campaigns where id = v_lead.campaign_id and workspace_id = v_workspace_id;
  if v_c.id is null then
    return 'Not on a campaign';
  end if;
  if v_c.status <> 'active' then
    return case when v_c.status = 'paused' then 'Campaign is paused' else 'Campaign is ' || v_c.status end;
  end if;

  if not exists (select 1 from campaign_assignments ca where ca.campaign_id = v_c.id and ca.user_id = p_agent_id) then
    return 'You are not on this campaign''s roster';
  end if;

  if v_lead.assigned_to is not null and v_lead.assigned_to <> p_agent_id then
    return 'Assigned to another agent';
  end if;

  if v_lead.screening_status = 'failed' then
    return 'Failed screening';
  elsif v_lead.screening_status = 'expired' then
    return 'Screening expired; needs re-screening';
  elsif v_lead.screening_status <> 'passed' or v_lead.screened_at is null then
    return 'Not screened yet';
  end if;

  if exists (select 1 from suppression_list s where s.workspace_id = v_workspace_id and s.phone_hash = v_lead.phone_hash) then
    return 'Number is on the suppression list';
  end if;

  if v_workspace.is_demo and not (v_lead.phone_e164 = any(v_workspace.demo_allowed_numbers)) then
    return 'Demo workspace: number not on the allow-list';
  end if;

  if v_lead.claimed_by is not null and v_lead.claimed_by <> p_agent_id and v_lead.claimed_at >= now() - v_claim_ttl then
    return 'Another agent is on this lead right now';
  end if;

  if v_lead.attempts >= v_c.max_attempts then
    return 'Maximum attempts reached';
  end if;

  if v_lead.last_attempt_at is not null
     and v_lead.last_attempt_at >= now() - (v_c.cooling_off_hours || ' hours')::interval then
    v_until := v_lead.last_attempt_at + (v_c.cooling_off_hours || ' hours')::interval;
    select coalesce(nullif(timezone, ''), 'UTC') into v_tz from profiles where id = p_agent_id;
    return 'Cooling-off until ' || to_char(v_until at time zone coalesce(v_tz, 'UTC'), 'HH24:MI');
  end if;

  if v_c.calling_window_start is not null and v_c.calling_window_end is not null
     and not ((now() at time zone coalesce(v_c.timezone, 'UTC'))::time between v_c.calling_window_start and v_c.calling_window_end) then
    return 'Outside calling hours (' || to_char(v_c.calling_window_start, 'HH24:MI') || '-' ||
           to_char(v_c.calling_window_end, 'HH24:MI') || ' ' || coalesce(v_c.timezone, 'UTC') || ')';
  end if;

  return null;
end;
$$;
revoke execute on function lead_dial_block_reason(uuid, uuid) from public, anon;
grant execute on function lead_dial_block_reason(uuid, uuid) to authenticated;
