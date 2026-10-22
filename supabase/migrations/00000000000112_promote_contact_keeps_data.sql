-- Flexible uploads: a file with no phone column (or rows with no number) is
-- kept as unphoned_contacts carrying the company and every other column
-- (custom). When the agent finds a number and promotes the contact, that data
-- must travel with it onto the lead instead of being dropped. Same checks as
-- migration 075 (authorisation, suppression, duplicates); only the insert
-- carries more columns.
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

  insert into leads (
    workspace_id, campaign_id, phone_e164, full_name, email, company_name, city,
    custom, data_source_id, screening_status, assigned_to, assigned_by, source
  )
  values (
    v_ws, v_contact.campaign_id, p_phone_e164, v_contact.full_name, v_contact.email,
    v_contact.company_name, v_contact.city,
    coalesce(v_contact.custom, '{}'::jsonb), v_contact.data_source_id, 'pending',
    -- The agent who was given the contact keeps the lead.
    v_contact.assigned_to, case when v_contact.assigned_to is not null then auth.uid() end, 'upload'
  )
  returning id into v_lead_id;

  update unphoned_contacts
  set promoted_lead_id = v_lead_id, promoted_at = now(), phone_raw = p_phone_raw
  where id = p_contact_id;

  return v_lead_id;
end;
$$;

revoke execute on function promote_unphoned_contact(uuid, text, text) from public, anon;
grant execute on function promote_unphoned_contact(uuid, text, text) to authenticated;
