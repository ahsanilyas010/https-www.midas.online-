-- Slice B, migration 1 of 5 - richer lead fields for the campaign lead
-- list, lead details and the agent "My leads" screen, plus lead
-- assignment. Everything new is nullable / defaulted so the seeded leads
-- and the compliance gate (next_lead_for_agent, record_call_attempt,
-- screen_lead_batch) are untouched. phone_hash is still computed only by
-- the leads_set_phone_hash trigger from migration 047.

alter table leads
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company_name text,
  add column if not exists job_title text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postcode text,
  add column if not exists country_code text,
  add column if not exists custom jsonb not null default '{}'::jsonb,
  add column if not exists agent_notes text,
  add column if not exists source text,
  add column if not exists status text not null default 'new',
  add column if not exists assigned_to uuid references profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check
  check (status in ('new', 'assigned', 'contacted', 'qualified', 'converted', 'rejected'));

create index if not exists leads_workspace_assigned_idx on leads (workspace_id, assigned_to);
create index if not exists leads_workspace_campaign_created_idx on leads (workspace_id, campaign_id, created_at desc);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- Keep full_name (the column the dial screen, QA and callbacks already
-- read) in step with first/last name whenever those are written.
create or replace function sync_lead_full_name() returns trigger
language plpgsql as $$
begin
  if (new.first_name is not null or new.last_name is not null)
     and (tg_op = 'INSERT'
          or new.first_name is distinct from old.first_name
          or new.last_name is distinct from old.last_name) then
    new.full_name := nullif(btrim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  end if;
  return new;
end;
$$;

create trigger leads_sync_full_name
  before insert or update of first_name, last_name on leads
  for each row execute function sync_lead_full_name();

-- Assignment bookkeeping + integrity: assigned_to must be a profile in the
-- same workspace; assigned_at tracks the moment of assignment; a 'new'
-- lead that gets an owner becomes 'assigned' and goes back to 'new' when
-- the owner is cleared.
create or replace function guard_lead_assignment() returns trigger
language plpgsql as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not exists (
      select 1 from profiles p
      where p.id = new.assigned_to and p.workspace_id = new.workspace_id
    ) then
      raise exception 'assigned_to must be a member of the lead''s workspace';
    end if;
    new.assigned_at := now();
    if new.status = 'new' then
      new.status := 'assigned';
    end if;
  elsif new.assigned_to is null then
    new.assigned_at := null;
    if new.status = 'assigned' then
      new.status := 'new';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_guard_assignment
  before insert or update of assigned_to on leads
  for each row execute function guard_lead_assignment();

-- ---------------------------------------------------------------------
-- Read access. Migration 047 let every staff role read every lead in the
-- workspace. Narrow the agent branch: an agent reads leads assigned to
-- them, leads they currently hold a dial claim on, and leads in campaigns
-- they are rostered on (the dial screen and their callbacks need those).
-- Managers, team leads and QA are unchanged. A client never matched.

create or replace function my_campaign_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from campaign_assignments where user_id = auth.uid()
$$;
revoke execute on function my_campaign_ids() from public, anon;
grant execute on function my_campaign_ids() to authenticated;

drop policy if exists leads_select on leads;
create policy leads_select on leads for select using (
  workspace_id = auth_workspace_id()
  and (
    auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'qa_analyst')
    or (
      auth_role() = 'agent' and (
        assigned_to = auth.uid()
        or claimed_by = auth.uid()
        or campaign_id in (select my_campaign_ids())
      )
    )
  )
);

-- ---------------------------------------------------------------------
-- Agent edit of an assigned lead. Agents have no UPDATE policy on leads
-- (attempts / claim / screening columns must only move through the gate
-- functions), so this SECURITY DEFINER function is the one narrow path:
-- it only touches contact fields + notes, only on a lead assigned to the
-- caller, and a changed phone number drops the lead back to
-- screening_status = 'pending' so the new number must be re-screened
-- before it is dialable. A suppressed number is refused outright.

create or replace function update_my_lead(
  p_lead_id uuid,
  p_first_name text,
  p_last_name text,
  p_company_name text,
  p_email text,
  p_phone_e164 text,
  p_address_line1 text,
  p_city text,
  p_region text,
  p_postcode text,
  p_agent_notes text
) returns leads
language plpgsql security definer set search_path = public as $$
declare
  v_lead leads;
  v_new_hash text;
begin
  select * into v_lead from leads
  where id = p_lead_id and workspace_id = auth_workspace_id() and assigned_to = auth.uid()
  for update;
  if v_lead.id is null then
    raise exception 'Lead not found, or it isn''t assigned to you.';
  end if;

  if p_phone_e164 is not null and p_phone_e164 is distinct from v_lead.phone_e164 then
    v_new_hash := compute_phone_hash(p_phone_e164);
    if exists (select 1 from suppression_list s where s.workspace_id = v_lead.workspace_id and s.phone_hash = v_new_hash) then
      raise exception 'That number is on the suppression list.';
    end if;
    if exists (
      select 1 from leads l
      where l.workspace_id = v_lead.workspace_id and l.campaign_id is not distinct from v_lead.campaign_id
        and l.phone_hash = v_new_hash and l.id <> v_lead.id
    ) then
      raise exception 'That phone number is already used by another lead in this campaign.' using errcode = '23505';
    end if;
    update leads
    set phone_e164 = p_phone_e164, screening_status = 'pending', screened_at = null
    where id = v_lead.id;
  end if;

  update leads
  set first_name = nullif(btrim(p_first_name), ''),
      last_name = nullif(btrim(p_last_name), ''),
      company_name = nullif(btrim(p_company_name), ''),
      email = nullif(btrim(p_email), ''),
      address_line1 = nullif(btrim(p_address_line1), ''),
      city = nullif(btrim(p_city), ''),
      region = nullif(btrim(p_region), ''),
      postcode = nullif(btrim(p_postcode), ''),
      agent_notes = nullif(btrim(p_agent_notes), '')
  where id = v_lead.id
  returning * into v_lead;

  return v_lead;
end;
$$;
revoke execute on function update_my_lead(uuid, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_my_lead(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Agent-set pipeline status on their own lead. Same ownership rule.
create or replace function set_my_lead_status(p_lead_id uuid, p_status text) returns leads
language plpgsql security definer set search_path = public as $$
declare
  v_lead leads;
begin
  if p_status not in ('assigned', 'contacted', 'qualified', 'converted', 'rejected') then
    raise exception 'invalid lead status';
  end if;
  update leads set status = p_status
  where id = p_lead_id and workspace_id = auth_workspace_id() and assigned_to = auth.uid()
  returning * into v_lead;
  if v_lead.id is null then
    raise exception 'Lead not found, or it isn''t assigned to you.';
  end if;
  return v_lead;
end;
$$;
revoke execute on function set_my_lead_status(uuid, text) from public, anon;
grant execute on function set_my_lead_status(uuid, text) to authenticated;
