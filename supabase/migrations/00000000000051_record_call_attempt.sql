-- Phase 2, migration 5 of 7 — record_call_attempt(). The only path that
-- writes a calls row, increments a lead's attempts, releases its claim,
-- and — critically — inserts into suppression_list in the SAME
-- transaction as the call row when the disposition sets DNC (spec: "A dnc
-- disposition inserts into suppression_list in the same transaction as
-- the call row"). Postgres function bodies run in the calling
-- transaction, so this is naturally atomic without an explicit BEGIN/COMMIT.

create or replace function record_call_attempt(
  p_lead_id uuid,
  p_disposition_code text,
  p_notes text default null,
  p_callback_due_at timestamptz default null
) returns calls
language plpgsql security definer set search_path = public as $$
declare
  v_agent_id uuid := auth.uid();
  v_workspace_id uuid := auth_workspace_id();
  v_lead leads;
  v_disposition dispositions;
  v_call calls;
begin
  select * into v_lead from leads where id = p_lead_id and workspace_id = v_workspace_id for update;
  if v_lead.id is null then
    raise exception 'lead not found in your workspace';
  end if;
  if v_lead.claimed_by is distinct from v_agent_id then
    raise exception 'this lead is not currently claimed by you';
  end if;

  select * into v_disposition from dispositions where code = p_disposition_code;
  if v_disposition.id is null then
    raise exception 'unknown disposition code %', p_disposition_code;
  end if;
  if v_disposition.requires_note and (p_notes is null or length(trim(p_notes)) = 0) then
    raise exception 'this outcome requires a note';
  end if;

  insert into calls (workspace_id, lead_id, campaign_id, agent_id, disposition_id, notes, ended_at)
  values (v_workspace_id, p_lead_id, v_lead.campaign_id, v_agent_id, v_disposition.id, p_notes, now())
  returning * into v_call;

  update leads
  set attempts = attempts + 1,
      last_attempt_at = now(),
      claimed_by = null,
      claimed_at = null
  where id = p_lead_id;

  if v_disposition.sets_dnc then
    insert into suppression_list (workspace_id, phone_hash, reason, added_by)
    values (v_workspace_id, v_lead.phone_hash, 'disposition:' || v_disposition.code, v_agent_id)
    on conflict (workspace_id, phone_hash) do nothing;
  end if;

  if v_disposition.requires_followup and p_callback_due_at is not null then
    insert into callbacks (workspace_id, lead_id, call_id, agent_id, due_at)
    values (v_workspace_id, p_lead_id, v_call.id, v_agent_id, p_callback_due_at);
  end if;

  -- Close out the callback this call fulfilled, if it came from queue 1
  -- of next_lead_for_agent().
  update callbacks
  set status = 'done', call_id = v_call.id
  where lead_id = p_lead_id and agent_id = v_agent_id and status = 'pending' and call_id is null;

  return v_call;
end;
$$;

revoke execute on function record_call_attempt(uuid, text, text, timestamptz) from public, anon;
grant execute on function record_call_attempt(uuid, text, text, timestamptz) to authenticated;
