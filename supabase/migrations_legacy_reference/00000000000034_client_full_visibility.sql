-- Section 6.6 follow-up — full agent-activity visibility for a specific
-- client, opt-in per client rather than the aggregate-only default. The
-- requester wants a client account to see everything an admin sees on
-- their own leads (full lead detail, every call attempt's disposition,
-- every scheduled follow-up/"appointment") — with one deliberate
-- exception: which agent worked it is never shown by name, only a
-- per-client anonymous label ("Agent 1", "Agent 2", ...) so the client
-- can still tell the same agent handled something twice without knowing
-- who that is.
--
-- Scoped per client via clients.full_visibility rather than a role change
-- or a hardcoded id in these functions, so it stays an explicit opt-in
-- and every other client_viewer keeps today's aggregate-only view. The
-- flag itself is set on the specific client's row via a one-off update,
-- not by this migration (schema only, no seed data).

alter table clients add column if not exists full_visibility boolean not null default false;

-- Per-client agent aliasing. Assigned lazily (first time an agent's work
-- shows up for that client) and kept stable forever after — a new agent
-- joining never renumbers an existing one, and the same agent always
-- reads the same label to a given client across leads, calls and
-- follow-ups.
create table if not exists client_agent_labels (
  client_id uuid not null references clients(id) on delete cascade,
  agent_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, agent_id)
);

alter table client_agent_labels enable row level security;
create policy client_agent_labels_select on client_agent_labels for select using (is_manager());
grant select on client_agent_labels to authenticated;

create or replace function ensure_client_agent_labels(p_client_id uuid, p_agent_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_agent_id uuid;
  v_next int;
begin
  if p_client_id is null then
    return;
  end if;
  foreach v_agent_id in array p_agent_ids loop
    if v_agent_id is null then
      continue;
    end if;
    if not exists (select 1 from client_agent_labels where client_id = p_client_id and agent_id = v_agent_id) then
      select count(*) + 1 into v_next from client_agent_labels where client_id = p_client_id;
      insert into client_agent_labels (client_id, agent_id, label)
      values (p_client_id, v_agent_id, 'Agent ' || v_next)
      on conflict (client_id, agent_id) do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function ensure_client_agent_labels(uuid, uuid[]) from public, anon, authenticated;

-- Full lead detail — everything the admin campaign leads table shows,
-- minus which agent it's assigned to (an anonymous label instead).
create type client_lead_row as (
  id uuid,
  campaign_id uuid,
  campaign_name text,
  campaign_code text,
  first_name text,
  last_name text,
  company_name text,
  job_title text,
  phone_e164 text,
  email text,
  address_line1 text,
  city text,
  region text,
  postcode text,
  status text,
  screening_status text,
  do_not_call boolean,
  assigned_agent_label text,
  attempt_count int,
  custom jsonb,
  created_at timestamptz
);

create or replace function get_client_leads(p_client_id uuid default null)
returns setof client_lead_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null
       or not coalesce((select full_visibility from clients where id = v_client_id), false) then
      return;
    end if;
  elsif is_manager() then
    v_client_id := p_client_id;
  else
    raise exception 'not authorized';
  end if;

  if v_client_id is not null then
    perform ensure_client_agent_labels(
      v_client_id,
      array(
        select distinct l.assigned_to from leads l
        join campaigns c on c.id = l.campaign_id
        where c.client_id = v_client_id and l.assigned_to is not null
      )
    );
  end if;

  return query
    select
      l.id, l.campaign_id, c.name, c.code,
      l.first_name, l.last_name, l.company_name, l.job_title,
      l.phone_e164, l.email, l.address_line1, l.city, l.region, l.postcode,
      l.status::text, l.screening_status::text, l.do_not_call,
      cal.label,
      l.attempt_count, l.custom, l.created_at
    from leads l
    join campaigns c on c.id = l.campaign_id
    left join client_agent_labels cal on cal.client_id = v_client_id and cal.agent_id = l.assigned_to
    where (v_client_id is null or c.client_id = v_client_id)
    order by l.created_at desc
    limit 500;
end;
$$;

revoke execute on function get_client_leads(uuid) from public, anon;
grant execute on function get_client_leads(uuid) to authenticated;

-- Every call attempt logged against the client's leads — the disposition
-- trail. Same admin-visible fields (notes included) minus the agent's name.
create type client_call_log_row as (
  id uuid,
  lead_id uuid,
  campaign_id uuid,
  campaign_code text,
  first_name text,
  last_name text,
  company_name text,
  phone_e164 text,
  agent_label text,
  attempt_no int,
  disposition_code text,
  disposition_label text,
  category text,
  started_at timestamptz,
  ended_at timestamptz,
  talk_seconds int,
  wrap_seconds int,
  notes text
);

create or replace function get_client_call_log(p_client_id uuid default null)
returns setof client_call_log_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null
       or not coalesce((select full_visibility from clients where id = v_client_id), false) then
      return;
    end if;
  elsif is_manager() then
    v_client_id := p_client_id;
  else
    raise exception 'not authorized';
  end if;

  if v_client_id is not null then
    perform ensure_client_agent_labels(
      v_client_id,
      array(
        select distinct ca.agent_id from call_attempts ca
        join campaigns c on c.id = ca.campaign_id
        where c.client_id = v_client_id
      )
    );
  end if;

  return query
    select
      ca.id, ca.lead_id, ca.campaign_id, c.code,
      l.first_name, l.last_name, l.company_name, l.phone_e164,
      cal.label,
      ca.attempt_no, d.code, d.label, d.category,
      ca.started_at, ca.ended_at, ca.talk_seconds, ca.wrap_seconds, ca.notes
    from call_attempts ca
    join campaigns c on c.id = ca.campaign_id
    join leads l on l.id = ca.lead_id
    left join dispositions d on d.id = ca.disposition_id
    left join client_agent_labels cal on cal.client_id = v_client_id and cal.agent_id = ca.agent_id
    where (v_client_id is null or c.client_id = v_client_id)
    order by ca.started_at desc
    limit 1000;
end;
$$;

revoke execute on function get_client_call_log(uuid) from public, anon;
grant execute on function get_client_call_log(uuid) to authenticated;

-- "Appointments" — the existing follow-up/callback system (followups
-- table), not a separate booked-meeting feature.
create type client_followup_row as (
  id uuid,
  lead_id uuid,
  campaign_id uuid,
  campaign_code text,
  first_name text,
  last_name text,
  company_name text,
  phone_e164 text,
  agent_label text,
  followup_type text,
  due_at timestamptz,
  note text,
  priority text,
  status text,
  snooze_count int
);

create or replace function get_client_followups(p_client_id uuid default null)
returns setof client_followup_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null
       or not coalesce((select full_visibility from clients where id = v_client_id), false) then
      return;
    end if;
  elsif is_manager() then
    v_client_id := p_client_id;
  else
    raise exception 'not authorized';
  end if;

  if v_client_id is not null then
    perform ensure_client_agent_labels(
      v_client_id,
      array(
        select distinct f.assigned_to from followups f
        join campaigns c on c.id = f.campaign_id
        where c.client_id = v_client_id
      )
    );
  end if;

  return query
    select
      f.id, f.lead_id, f.campaign_id, c.code,
      l.first_name, l.last_name, l.company_name, l.phone_e164,
      cal.label,
      f.followup_type, f.due_at, f.note, f.priority, f.status, f.snooze_count
    from followups f
    join campaigns c on c.id = f.campaign_id
    join leads l on l.id = f.lead_id
    left join client_agent_labels cal on cal.client_id = v_client_id and cal.agent_id = f.assigned_to
    where (v_client_id is null or c.client_id = v_client_id)
    order by f.due_at desc
    limit 500;
end;
$$;

revoke execute on function get_client_followups(uuid) from public, anon;
grant execute on function get_client_followups(uuid) to authenticated;
