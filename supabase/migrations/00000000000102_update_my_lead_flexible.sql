-- update_my_lead() gains one optional trailing argument, p_extra (jsonb), that
-- carries the new editable fields: website, contact_name, next_step,
-- appointment_at (notes stay in p_agent_notes). A key that is absent leaves
-- the field alone; a key set to "" / null clears it. Everything else is the
-- migration 68 behaviour: only the caller's own assigned lead, a changed
-- phone number must not be suppressed or duplicated and drops the lead back to
-- screening 'pending'.
drop function if exists update_my_lead(uuid, text, text, text, text, text, text, text, text, text, text);

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
  p_agent_notes text,
  p_extra jsonb default null
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

  if p_extra is not null and jsonb_typeof(p_extra) = 'object' then
    update leads
    set website = case when p_extra ? 'website' then left(nullif(btrim(p_extra->>'website'), ''), 300) else website end,
        contact_name = case when p_extra ? 'contact_name' then left(nullif(btrim(p_extra->>'contact_name'), ''), 200) else contact_name end,
        next_step = case when p_extra ? 'next_step' then left(nullif(btrim(p_extra->>'next_step'), ''), 500) else next_step end,
        appointment_at = case when p_extra ? 'appointment_at' then nullif(btrim(p_extra->>'appointment_at'), '')::timestamptz else appointment_at end
    where id = v_lead.id
    returning * into v_lead;
  end if;

  return v_lead;
end;
$$;
revoke execute on function update_my_lead(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function update_my_lead(uuid, text, text, text, text, text, text, text, text, text, text, jsonb) to authenticated;
