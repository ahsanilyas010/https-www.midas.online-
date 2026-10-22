-- Call sheet, part 3: one read for the whole board. SECURITY INVOKER, so RLS
-- decides which leads/contacts the caller can see; on top of that agents only
-- get their own and unassigned leads, team leads their team's. Computed per row:
-- bucket (urgency), campaign name, pending callback for the caller, latest call
-- outcome, last contact, and dial_block_reason (null = dialable).
create or replace function call_sheet(p_limit int default 300)
returns table (
  id uuid,
  kind text,
  campaign_id uuid,
  campaign_name text,
  bucket text,
  company_name text,
  full_name text,
  first_name text,
  last_name text,
  contact_name text,
  email text,
  phone_e164 text,
  website text,
  agent_notes text,
  next_step text,
  appointment_at timestamptz,
  imported_last_contact_at timestamptz,
  last_attempt_at timestamptz,
  last_contact timestamptz,
  status text,
  assigned_to uuid,
  attempts int,
  max_attempts int,
  custom jsonb,
  job_title text,
  address_line1 text,
  city text,
  region text,
  postcode text,
  country_hint text,
  callback_id uuid,
  callback_due_at timestamptz,
  last_outcome_code text,
  last_outcome_label text,
  last_outcome_at timestamptz,
  last_outcome_notes text,
  claimed_by_me boolean,
  dial_block_reason text,
  total_count bigint
)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role app_role := auth_role();
  v_limit int := least(greatest(coalesce(p_limit, 300), 1), 1000);
begin
  if v_role is null or v_role not in ('super_admin', 'ops_manager', 'team_lead', 'agent') then
    raise exception 'The call sheet is not available for your role.' using errcode = '42501';
  end if;

  return query
  with base as (
    select
      l.id as b_id, 'lead'::text as b_kind, l.campaign_id as b_campaign_id, c.name as b_campaign_name,
      l.company_name as b_company_name, l.full_name as b_full_name, l.first_name as b_first_name,
      l.last_name as b_last_name, l.contact_name as b_contact_name, l.email as b_email,
      l.phone_e164 as b_phone, l.website as b_website, l.agent_notes as b_agent_notes,
      l.next_step as b_next_step, l.appointment_at as b_appointment_at,
      l.last_contact_at as b_imported_last_contact_at, l.last_attempt_at as b_last_attempt_at,
      greatest(l.last_attempt_at, l.last_contact_at) as b_last_contact,
      l.status as b_status, l.assigned_to as b_assigned_to, l.attempts as b_attempts,
      c.max_attempts as b_max_attempts, l.custom as b_custom, l.job_title as b_job_title,
      l.address_line1 as b_address_line1, l.city as b_city, l.region as b_region,
      l.postcode as b_postcode, null::text as b_country_hint,
      cb.id as b_callback_id, cb.due_at as b_callback_due_at,
      lo.code as b_last_outcome_code, lo.label as b_last_outcome_label,
      lo.at as b_last_outcome_at, lo.notes as b_last_outcome_notes,
      (l.claimed_by = v_uid and l.claimed_at >= now() - interval '10 minutes') as b_claimed_by_me,
      l.created_at as b_created_at
    from leads l
    left join campaigns c on c.id = l.campaign_id
    left join lateral (
      select k.id, k.due_at from callbacks k
      where k.lead_id = l.id and k.agent_id = v_uid and k.status = 'pending'
      order by k.due_at asc limit 1
    ) cb on true
    left join lateral (
      select d.code, d.label, k.disposed_at as at, k.notes
      from calls k join dispositions d on d.id = k.disposition_id
      where k.lead_id = l.id and k.disposition_id is not null
      order by k.disposed_at desc nulls last limit 1
    ) lo on true
    where l.workspace_id = auth_workspace_id()
      and l.status not in ('rejected', 'converted')
      and (
        v_role in ('super_admin', 'ops_manager')
        or (v_role = 'agent' and (l.assigned_to = v_uid or l.assigned_to is null or l.claimed_by = v_uid))
        or (v_role = 'team_lead' and (l.assigned_to is null or l.assigned_to = v_uid or l.assigned_to in (select my_team_members())))
      )
    union all
    select
      u.id, 'contact'::text, u.campaign_id, c.name,
      u.company_name, u.full_name, null::text, null::text, null::text, u.email,
      null::text, null::text, null::text, null::text, null::timestamptz,
      null::timestamptz, null::timestamptz,
      null::timestamptz,
      'new'::text, u.assigned_to, 0, c.max_attempts, u.custom, null::text,
      null::text, u.city, null::text, null::text, u.country_hint,
      null::uuid, null::timestamptz,
      null::text, null::text, null::timestamptz, null::text,
      false,
      u.created_at
    from unphoned_contacts u
    left join campaigns c on c.id = u.campaign_id
    where u.workspace_id = auth_workspace_id()
      and u.promoted_lead_id is null
      and (
        v_role in ('super_admin', 'ops_manager')
        or (v_role = 'agent' and u.assigned_to = v_uid)
        or (v_role = 'team_lead' and (u.assigned_to = v_uid or u.assigned_to in (select my_team_members())))
      )
  ),
  bucketed as (
    select b.*,
      case
        when b.b_kind = 'contact' then 'new'
        when (b.b_appointment_at is not null and b.b_appointment_at < now())
          or (b.b_callback_due_at is not null and b.b_callback_due_at <= now()) then 'overdue'
        when b.b_appointment_at is not null then 'upcoming'
        when b.b_callback_due_at is not null then 'callback'
        when b.b_attempts = 0 and b.b_last_contact is null then 'new'
        when b.b_last_contact is null or b.b_last_contact < now() - interval '7 days' then 'reengage'
        else 'recent'
      end as bucket_calc
    from base b
  )
  select
    z.b_id, z.b_kind, z.b_campaign_id, z.b_campaign_name, z.bucket_calc,
    z.b_company_name, z.b_full_name, z.b_first_name, z.b_last_name, z.b_contact_name, z.b_email,
    z.b_phone, z.b_website, z.b_agent_notes, z.b_next_step, z.b_appointment_at,
    z.b_imported_last_contact_at, z.b_last_attempt_at, z.b_last_contact,
    z.b_status, z.b_assigned_to, z.b_attempts, z.b_max_attempts, z.b_custom, z.b_job_title,
    z.b_address_line1, z.b_city, z.b_region, z.b_postcode, z.b_country_hint,
    z.b_callback_id, z.b_callback_due_at,
    z.b_last_outcome_code, z.b_last_outcome_label, z.b_last_outcome_at, z.b_last_outcome_notes,
    coalesce(z.b_claimed_by_me, false),
    case when z.b_kind = 'lead' then lead_dial_block_reason(z.b_id, v_uid) else null end,
    count(*) over ()
  from bucketed z
  order by
    case z.bucket_calc when 'overdue' then 0 when 'upcoming' then 1 when 'callback' then 2
      when 'new' then 3 when 'reengage' then 4 else 5 end,
    least(z.b_appointment_at, z.b_callback_due_at) asc nulls last,
    z.b_last_contact asc nulls first,
    z.b_created_at asc
  limit v_limit;
end;
$$;
revoke execute on function call_sheet(int) from public, anon;
grant execute on function call_sheet(int) to authenticated;
