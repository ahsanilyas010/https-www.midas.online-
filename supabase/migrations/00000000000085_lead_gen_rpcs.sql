-- Lead Gen seat, 2 of 4 - SECURITY DEFINER helpers. Each one checks the
-- caller (lead_gen, or a workspace manager acting on the same screens),
-- scopes every statement to the caller's workspace, and returns only what
-- the lead-gen screens need, so lead_gen needs no direct read access to
-- campaigns, profiles or the full leads table.
--
-- The compliance gate is untouched: assignment never sets screening_status,
-- never clears a claim, and skips suppressed / failed-screening leads.
-- next_lead_for_agent() still only serves screened, unsuppressed leads.

create or replace function is_lead_gen_or_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('lead_gen', 'super_admin', 'ops_manager')
$$;
revoke execute on function is_lead_gen_or_manager() from public, anon;
grant execute on function is_lead_gen_or_manager() to authenticated;

-- Campaign pick-list (names / status only).
create or replace function leadgen_campaigns()
returns table (id uuid, name text, code text, status text, country text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_lead_gen_or_manager() then
    raise exception 'not allowed';
  end if;
  return query
    select c.id, c.name, c.code, c.status::text, c.country
    from campaigns c
    where c.workspace_id = auth_workspace_id()
    order by c.name;
end;
$$;
revoke execute on function leadgen_campaigns() from public, anon;
grant execute on function leadgen_campaigns() to authenticated;

-- Sales agents a lead can be handed to (names only), with whether each is
-- on the given campaign's roster and how many open leads they hold.
create or replace function leadgen_assignable_agents(p_campaign_id uuid default null)
returns table (id uuid, full_name text, agent_code text, on_roster boolean, open_leads int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_lead_gen_or_manager() then
    raise exception 'not allowed';
  end if;
  return query
    select p.id, p.full_name, p.agent_code,
      (p_campaign_id is not null and exists (
        select 1 from campaign_assignments ca
        where ca.campaign_id = p_campaign_id and ca.user_id = p.id and ca.workspace_id = p.workspace_id
      )) as on_roster,
      (select count(*)::int from leads l
        where l.workspace_id = p.workspace_id and l.assigned_to = p.id
          and l.status in ('assigned', 'contacted')) as open_leads
    from profiles p
    where p.workspace_id = auth_workspace_id() and p.role = 'agent' and p.is_active
    order by p.full_name;
end;
$$;
revoke execute on function leadgen_assignable_agents(uuid) from public, anon;
grant execute on function leadgen_assignable_agents(uuid) to authenticated;

-- Duplicate / suppression pre-check for imports: which of these phone hashes
-- already exist as a lead, or are on the suppression list, anywhere in the
-- workspace (lead_gen can only read a slice of leads directly). Returns
-- hashes only.
create or replace function leadgen_known_hashes(p_hashes text[])
returns table (phone_hash text, kind text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
begin
  if not is_lead_gen_or_manager() then
    raise exception 'not allowed';
  end if;
  return query
    select l.phone_hash, 'lead'::text from leads l
      where l.workspace_id = v_ws and l.phone_hash = any(p_hashes)
    union
    select s.phone_hash, 'suppressed'::text from suppression_list s
      where s.workspace_id = v_ws and s.phone_hash = any(p_hashes);
end;
$$;
revoke execute on function leadgen_known_hashes(text[]) from public, anon;
grant execute on function leadgen_known_hashes(text[]) to authenticated;

-- Hand selected leads to ONE agent. Rules:
--   * the campaign and the agent must belong to the caller's workspace and
--     the agent must be an active sales agent on that campaign's roster;
--   * only leads nobody owns, or leads this caller handed off earlier that
--     the agent has not touched yet (status 'assigned', no attempts), move;
--   * a lead already in another campaign is skipped; a lead with no
--     campaign is placed in this one;
--   * suppressed numbers and failed-screening leads are skipped.
-- Returns counts. Screening is NOT changed: a pending lead reaches the agent
-- but is not dialable until a manager screens it.
create or replace function leadgen_assign_leads(p_lead_ids uuid[], p_campaign_id uuid, p_agent_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_me uuid := auth.uid();
  v_total int := coalesce(array_length(p_lead_ids, 1), 0);
  v_assigned int := 0;
begin
  if not is_lead_gen_or_manager() then
    raise exception 'only lead gen or a manager can hand off leads';
  end if;
  if v_total = 0 then
    raise exception 'select at least one lead';
  end if;
  if v_total > 2000 then
    raise exception 'at most 2000 leads per hand-off';
  end if;
  if not exists (select 1 from campaigns where id = p_campaign_id and workspace_id = v_ws) then
    raise exception 'campaign not found';
  end if;
  if not exists (
    select 1 from profiles p
    where p.id = p_agent_id and p.workspace_id = v_ws and p.role = 'agent' and p.is_active
  ) then
    raise exception 'agent not found';
  end if;
  if not exists (
    select 1 from campaign_assignments ca
    where ca.campaign_id = p_campaign_id and ca.user_id = p_agent_id and ca.workspace_id = v_ws
  ) then
    raise exception 'that agent is not on this campaign''s roster';
  end if;

  update leads l
  set assigned_to = p_agent_id,
      assigned_by = v_me,
      campaign_id = coalesce(l.campaign_id, p_campaign_id)
  where l.id = any(p_lead_ids)
    and l.workspace_id = v_ws
    and (l.campaign_id is null or l.campaign_id = p_campaign_id)
    and l.screening_status <> 'failed'
    and (
      l.assigned_to is null
      or (l.assigned_by = v_me and l.status = 'assigned' and l.attempts = 0)
    )
    and not exists (
      select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = l.phone_hash
    );
  get diagnostics v_assigned = row_count;

  return jsonb_build_object('requested', v_total, 'assigned', v_assigned, 'skipped', v_total - v_assigned);
end;
$$;
revoke execute on function leadgen_assign_leads(uuid[], uuid, uuid) from public, anon;
grant execute on function leadgen_assign_leads(uuid[], uuid, uuid) to authenticated;

-- Round-robin hand-off across the campaign's active, rostered agents. Each
-- lead goes to whichever agent currently holds the fewest open leads (ties
-- broken by roster order), so repeated runs stay balanced. Same eligibility
-- rules as leadgen_assign_leads. p_lead_ids = null means every eligible
-- unassigned lead in the campaign (capped at 1000).
create or replace function leadgen_auto_assign(p_campaign_id uuid, p_lead_ids uuid[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_me uuid := auth.uid();
  v_agents uuid[];
  v_loads int[];
  v_lead record;
  v_i int;
  v_min int;
  v_assigned int := 0;
  v_considered int := 0;
begin
  if not is_lead_gen_or_manager() then
    raise exception 'only lead gen or a manager can hand off leads';
  end if;
  if not exists (select 1 from campaigns where id = p_campaign_id and workspace_id = v_ws) then
    raise exception 'campaign not found';
  end if;

  select array_agg(x.user_id order by x.created_at, x.user_id),
         array_agg(x.open_leads order by x.created_at, x.user_id)
  into v_agents, v_loads
  from (
    select ca.user_id, ca.created_at,
      (select count(*)::int from leads l
        where l.workspace_id = v_ws and l.assigned_to = ca.user_id and l.status in ('assigned', 'contacted')) as open_leads
    from campaign_assignments ca
    join profiles p on p.id = ca.user_id and p.is_active and p.role = 'agent'
    where ca.campaign_id = p_campaign_id and ca.workspace_id = v_ws
  ) x;
  if v_agents is null then
    raise exception 'no active sales agents are on this campaign''s roster';
  end if;

  for v_lead in
    select l.id
    from leads l
    where l.workspace_id = v_ws
      and (p_lead_ids is null or l.id = any(p_lead_ids))
      and (l.campaign_id is null or l.campaign_id = p_campaign_id)
      and (p_lead_ids is not null or l.campaign_id = p_campaign_id)
      and l.screening_status <> 'failed'
      and (
        l.assigned_to is null
        or (p_lead_ids is not null and l.assigned_by = v_me and l.status = 'assigned' and l.attempts = 0)
      )
      and not exists (
        select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = l.phone_hash
      )
    order by l.created_at, l.id
    limit case when p_lead_ids is null then 1000 else 2000 end
    for update of l
  loop
    v_considered := v_considered + 1;
    v_i := 1;
    v_min := 1;
    while v_i <= array_length(v_agents, 1) loop
      if v_loads[v_i] < v_loads[v_min] then
        v_min := v_i;
      end if;
      v_i := v_i + 1;
    end loop;

    update leads
    set assigned_to = v_agents[v_min],
        assigned_by = v_me,
        campaign_id = coalesce(campaign_id, p_campaign_id)
    where id = v_lead.id;
    v_loads[v_min] := v_loads[v_min] + 1;
    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object(
    'requested', coalesce(array_length(p_lead_ids, 1), v_considered),
    'assigned', v_assigned,
    'skipped', coalesce(array_length(p_lead_ids, 1), v_considered) - v_assigned,
    'agents', array_length(v_agents, 1)
  );
end;
$$;
revoke execute on function leadgen_auto_assign(uuid, uuid[]) from public, anon;
grant execute on function leadgen_auto_assign(uuid, uuid[]) to authenticated;

-- Aggregate-only dashboard numbers, workspace-wide (counts, no lead rows).
create or replace function leadgen_dashboard_stats(p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_days int := greatest(1, least(coalesce(p_days, 14), 90));
  v_result jsonb;
begin
  if not is_lead_gen_or_manager() then
    raise exception 'not allowed';
  end if;

  with src as (
    select l.id, l.created_at, l.screening_status, l.assigned_to,
           coalesce(nullif(l.source, ''), ds.name, 'unknown') as source_label
    from leads l
    left join data_sources ds on ds.id = l.data_source_id
    where l.workspace_id = v_ws
  )
  select jsonb_build_object(
    'added_today', count(*) filter (where created_at >= date_trunc('day', now())),
    'added_7d', count(*) filter (where created_at >= now() - interval '7 days'),
    'added_30d', count(*) filter (where created_at >= now() - interval '30 days'),
    'pending', count(*) filter (where screening_status = 'pending'),
    'passed', count(*) filter (where screening_status = 'passed'),
    'failed', count(*) filter (where screening_status in ('failed', 'expired')),
    'unassigned', count(*) filter (where assigned_to is null),
    'assigned', count(*) filter (where assigned_to is not null),
    'total', count(*),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', s.source_label, 'total', s.total, 'last7', s.last7,
        'pending', s.pending, 'passed', s.passed, 'assigned', s.assigned) order by s.total desc)
      from (
        select source_label,
          count(*) as total,
          count(*) filter (where created_at >= now() - interval '7 days') as last7,
          count(*) filter (where screening_status = 'pending') as pending,
          count(*) filter (where screening_status = 'passed') as passed,
          count(*) filter (where assigned_to is not null) as assigned
        from src group by source_label
      ) s
    ), '[]'::jsonb),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object('day', t.day, 'source', t.source_label, 'count', t.n) order by t.day)
      from (
        select (created_at at time zone 'UTC')::date as day, source_label, count(*) as n
        from src
        where created_at >= (date_trunc('day', now()) - ((v_days - 1) || ' days')::interval)
        group by 1, 2
      ) t
    ), '[]'::jsonb)
  )
  into v_result
  from src;

  return v_result;
end;
$$;
revoke execute on function leadgen_dashboard_stats(int) from public, anon;
grant execute on function leadgen_dashboard_stats(int) to authenticated;
