-- Section 6.1: "Do Not Call writes to suppression_list immediately in the
-- same transaction as the call_attempts row. If the suppression insert
-- fails, the whole transaction rolls back." That's only achievable as a
-- single Postgres function, not two round-trips from the client — a crash
-- between two client-side inserts would leave a DNC disposition logged
-- without the number actually being suppressed.

create or replace function record_call_attempt(
  p_lead_id uuid,
  p_disposition_code text,
  p_notes text default null,
  p_wrap_seconds int default null,
  p_next_action_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lead leads%rowtype;
  v_campaign campaigns%rowtype;
  v_disposition dispositions%rowtype;
  v_attempt_id uuid;
  v_within_window boolean;
  v_new_status lead_status;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead not found';
  end if;

  if not (is_manager() or v_lead.assigned_to = auth.uid()) then
    raise exception 'this lead is not assigned to you';
  end if;

  select * into v_campaign from campaigns where id = v_lead.campaign_id;

  select * into v_disposition from dispositions
    where code = p_disposition_code
      and (campaign_id is null or campaign_id = v_campaign.id)
    order by campaign_id nulls last
    limit 1;
  if not found then
    raise exception 'unknown disposition code %', p_disposition_code;
  end if;

  if v_disposition.requires_note and coalesce(trim(p_notes), '') = '' then
    raise exception 'this disposition requires a note';
  end if;

  v_within_window :=
    (now() at time zone coalesce(v_lead.lead_timezone, 'UTC'))::time
      between v_campaign.call_window_start and v_campaign.call_window_end
    and extract(isodow from (now() at time zone coalesce(v_lead.lead_timezone, 'UTC')))::int
      = any(v_campaign.call_days);

  insert into call_attempts (
    lead_id, campaign_id, agent_id, attempt_no, disposition_id,
    ended_at, wrap_seconds, notes, lead_local_time, within_call_window
  ) values (
    p_lead_id, v_campaign.id, auth.uid(), v_lead.attempt_count + 1, v_disposition.id,
    now(), p_wrap_seconds, p_notes, now(), v_within_window
  ) returning id into v_attempt_id;

  v_new_status := case
    when v_disposition.sets_dnc then 'suppressed'
    when v_disposition.code = 'connected_interested' then 'qualified'
    when v_disposition.code = 'connected_callback' then 'callback'
    when v_disposition.code in ('connected_wrong_number', 'invalid_number') then 'unreachable'
    when v_disposition.is_terminal then 'rejected'
    else 'in_progress'
  end;

  update leads set
    attempt_count = v_lead.attempt_count + 1,
    last_attempt_at = now(),
    last_disposition_id = v_disposition.id,
    status = v_new_status,
    next_action_at = p_next_action_at,
    do_not_call = do_not_call or v_disposition.sets_dnc
  where id = p_lead_id;

  if v_disposition.sets_dnc then
    insert into suppression_list (phone_e164, reason, added_by, lead_id, evidence_note)
    values (v_lead.phone_e164, 'verbal_dnc', auth.uid(), v_lead.id, p_notes)
    on conflict (phone_e164) do update
      set reason = excluded.reason, evidence_note = excluded.evidence_note;
  end if;

  return v_attempt_id;
end;
$$;

revoke execute on function record_call_attempt(uuid, text, text, int, timestamptz) from public, anon;
grant execute on function record_call_attempt(uuid, text, text, int, timestamptz) to authenticated;
