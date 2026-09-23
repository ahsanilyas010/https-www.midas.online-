-- Contacts from a vendor export that has no phone number at all (only
-- name/email/project data) — every other import path this app has ever
-- had could rely on `leads.phone_e164 not null` because a phone number
-- was always present in the source; this one genuinely doesn't have one.
-- Rather than weaken that guarantee (every dialable lead has a
-- suppression-checked phone), contacts land here first. An assigned
-- agent or a manager fills in a phone number they've sourced separately,
-- and `promote_unphoned_contact()` is the one path that turns a contact
-- into a real `leads` row — going through the exact same phone-parse +
-- suppression-check the CSV/manual-entry paths already use, so a
-- promoted contact is held to the same bar as everything else in
-- `leads`, never a shortcut around it.

create table unphoned_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  data_source_id uuid not null references data_sources(id),
  project_ref text not null,
  person_ref text not null,
  project_title text,
  project_town text,
  project_value numeric,
  role text,
  company_ref text,
  first_name text,
  last_name text,
  email text,
  contact_added_on date,
  phone_raw text,
  country_hint text not null default 'GB',
  assigned_to uuid references profiles(id),
  promoted_lead_id uuid references leads(id),
  promoted_at timestamptz,
  custom jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, project_ref, person_ref)
);

create index unphoned_contacts_assigned_idx on unphoned_contacts(assigned_to);
create index unphoned_contacts_campaign_idx on unphoned_contacts(campaign_id);

alter table unphoned_contacts enable row level security;

-- Same visibility shape as `leads_select` (00000000000015): manager sees
-- everything, team_lead sees their team, an agent sees only contacts
-- assigned to them on a campaign they're actually on.
create policy unphoned_contacts_select on unphoned_contacts for select
  using (
    is_manager()
    or (auth_role() = 'team_lead' and assigned_to in (select my_team_members()))
    or (
      auth_role() = 'agent'
      and assigned_to = auth.uid()
      and exists (
        select 1 from campaign_assignments ca
        where ca.campaign_id = unphoned_contacts.campaign_id and ca.user_id = auth.uid()
      )
    )
  );

create policy unphoned_contacts_write_manager on unphoned_contacts for all
  using (is_manager())
  with check (is_manager());

-- An agent may edit their own assigned contact directly (e.g. jot a
-- found phone number into phone_raw without promoting it yet) — actually
-- promoting into `leads` still requires the SECURITY DEFINER function
-- below, since agents have no insert policy on `leads` itself.
create policy unphoned_contacts_update_agent on unphoned_contacts for update
  using (auth_role() = 'agent' and assigned_to = auth.uid())
  with check (auth_role() = 'agent' and assigned_to = auth.uid());

create trigger unphoned_contacts_set_updated_at
  before update on unphoned_contacts
  for each row execute function set_updated_at();

-- Turns one contact into a real, dialable-pending lead. `p_phone_e164` /
-- `p_phone_raw` are pre-validated by the caller (libphonenumber-js, same
-- as every other entry point) — this function's job is authorization
-- (mirrors record_call_attempt's ownership check exactly) and the
-- suppression-checked insert, atomically with marking the contact
-- promoted so it can't be promoted twice.
create or replace function public.promote_unphoned_contact(
  p_contact_id uuid,
  p_phone_e164 text,
  p_phone_raw text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contact unphoned_contacts%rowtype;
  v_suppressed boolean;
  v_lead_id uuid;
begin
  select * into v_contact from unphoned_contacts where id = p_contact_id for update;
  if not found then
    raise exception 'contact not found';
  end if;

  if v_contact.promoted_lead_id is not null then
    raise exception 'this contact has already been queued as a lead';
  end if;

  if not (is_manager() or v_contact.assigned_to = auth.uid()) then
    raise exception 'this contact is not assigned to you';
  end if;

  select exists(select 1 from suppression_list where phone_e164 = p_phone_e164) into v_suppressed;

  insert into leads (
    campaign_id, data_source_id, external_ref, first_name, last_name,
    phone_e164, phone_raw, email, city, country_code, custom,
    status, screening_status, do_not_call, assigned_to, assigned_at
  ) values (
    v_contact.campaign_id, v_contact.data_source_id,
    v_contact.project_ref || '#' || v_contact.person_ref,
    v_contact.first_name, v_contact.last_name,
    p_phone_e164, p_phone_raw, v_contact.email, v_contact.project_town, v_contact.country_hint,
    v_contact.custom,
    case when v_suppressed then 'suppressed' else 'new' end,
    case when v_suppressed then 'blocked' else 'unscreened' end,
    v_suppressed,
    v_contact.assigned_to, now()
  )
  returning id into v_lead_id;

  update unphoned_contacts
    set promoted_lead_id = v_lead_id, promoted_at = now(), phone_raw = p_phone_raw
    where id = p_contact_id;

  return v_lead_id;
end;
$function$;
