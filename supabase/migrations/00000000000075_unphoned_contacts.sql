-- Slice C: contacts from a vendor export that carry no phone number.
-- leads.phone_e164 must always be a screened, suppression-checked number,
-- so phone-less contacts land here first. A manager (or the agent the
-- contact is assigned to) supplies a number they sourced separately, and
-- promote_unphoned_contact() is the one path that turns it into a lead -
-- through the same hash + suppression check every other entry point uses.

create table unphoned_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  data_source_id uuid references data_sources(id),
  run_id uuid references source_fetch_runs(id) on delete set null,
  external_ref text,
  full_name text,
  email text,
  company_name text,
  city text,
  country_hint text not null default 'GB',
  phone_raw text,
  custom jsonb not null default '{}',
  assigned_to uuid references profiles(id),
  promoted_lead_id uuid references leads(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index unphoned_contacts_workspace_idx on unphoned_contacts (workspace_id, promoted_at);
create index unphoned_contacts_assigned_idx on unphoned_contacts (workspace_id, assigned_to);
create unique index unphoned_contacts_ref_idx on unphoned_contacts (workspace_id, data_source_id, external_ref)
  where external_ref is not null;

create trigger unphoned_contacts_set_updated_at
  before update on unphoned_contacts
  for each row execute function set_updated_at();

alter table unphoned_contacts enable row level security;

create policy unphoned_contacts_select on unphoned_contacts for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or (auth_role() = 'team_lead' and assigned_to in (select my_team_members()))
    or (auth_role() = 'agent' and assigned_to = auth.uid())
  )
);
create policy unphoned_contacts_write_manager on unphoned_contacts for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
-- An agent may jot a found number into their own assigned contact
-- (phone_raw) without promoting it; promotion itself goes through the
-- SECURITY DEFINER function, since agents cannot insert leads directly.
create policy unphoned_contacts_update_agent on unphoned_contacts for update using (
  workspace_id = auth_workspace_id() and auth_role() = 'agent' and assigned_to = auth.uid()
) with check (
  workspace_id = auth_workspace_id() and auth_role() = 'agent' and assigned_to = auth.uid()
);

grant select, insert, update, delete on unphoned_contacts to authenticated;

create trigger unphoned_contacts_audit
  after insert or update or delete on unphoned_contacts
  for each row execute function audit_row_change('unphoned_contact');

-- Turns one contact into a real lead (screening_status 'pending', i.e. not
-- dialable until a manager screens it). A number already on the
-- suppression list is rejected outright rather than inserted, and a number
-- already present as a lead in this workspace raises unique_violation.
create or replace function promote_unphoned_contact(
  p_contact_id uuid,
  p_phone_e164 text,
  p_phone_raw text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
  v_contact unphoned_contacts%rowtype;
  v_hash text := compute_phone_hash(p_phone_e164);
  v_lead_id uuid;
begin
  select * into v_contact from unphoned_contacts
  where id = p_contact_id and workspace_id = v_ws for update;
  if not found then
    raise exception 'contact not found';
  end if;
  if v_contact.promoted_lead_id is not null then
    raise exception 'this contact has already been queued as a lead';
  end if;
  if not (is_workspace_manager() or (auth_role() = 'agent' and v_contact.assigned_to = auth.uid())) then
    raise exception 'this contact is not assigned to you';
  end if;
  if exists (select 1 from suppression_list s where s.workspace_id = v_ws and s.phone_hash = v_hash) then
    raise exception 'that number is on the suppression list and cannot be promoted';
  end if;
  if exists (select 1 from leads l where l.workspace_id = v_ws and l.phone_hash = v_hash) then
    raise exception 'that phone number already exists as a lead' using errcode = '23505';
  end if;

  insert into leads (workspace_id, campaign_id, phone_e164, full_name, email, data_source_id, screening_status)
  values (v_ws, v_contact.campaign_id, p_phone_e164, v_contact.full_name, v_contact.email,
          v_contact.data_source_id, 'pending')
  returning id into v_lead_id;

  update unphoned_contacts
  set promoted_lead_id = v_lead_id, promoted_at = now(), phone_raw = p_phone_raw
  where id = p_contact_id;

  return v_lead_id;
end;
$$;

revoke execute on function promote_unphoned_contact(uuid, text, text) from public, anon;
grant execute on function promote_unphoned_contact(uuid, text, text) to authenticated;
