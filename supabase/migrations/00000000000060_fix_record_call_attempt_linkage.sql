-- Phase 6, migration 2 of 3 — fixes a seam between Phase 2 and Phase 3.
--
-- record_call_attempt() (migration 00000000000051, written in Phase 2
-- before the real dialer existed) always INSERTed a fresh calls row to
-- log that an attempt happened. Phase 3's placeCall() then started
-- INSERTing its OWN calls row per phone call (with the Twilio call SID,
-- status, answered_at/ended_at from the status webhook). The two were
-- never the same row — record_call_attempt()'s row never carried Twilio's
-- timing data, which would have made v_agent_scorecard's talk-time math
-- (migration 059) silently wrong for every real call.
--
-- Fix: record_call_attempt() now updates the open call row placeCall()
-- created for this lead+agent (matched by lead_id/agent_id with no
-- disposition yet) instead of inserting a new one. It still inserts a
-- fresh row when none exists — the compliance-gate-proof script
-- (scripts/compliance-gate-proof.ts) and any manual/no-dial disposition
-- entry call record_call_attempt() directly without ever calling
-- placeCall(), and must keep working exactly as before.

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
  v_existing_call_id uuid;
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

  select id into v_existing_call_id
  from calls
  where lead_id = p_lead_id and agent_id = v_agent_id and disposition_id is null
  order by created_at desc
  limit 1;

  if v_existing_call_id is not null then
    update calls
    set disposition_id = v_disposition.id,
        notes = p_notes,
        ended_at = coalesce(ended_at, now()),
        disposed_at = now()
    where id = v_existing_call_id
    returning * into v_call;
  else
    insert into calls (workspace_id, lead_id, campaign_id, agent_id, disposition_id, notes, ended_at, disposed_at)
    values (v_workspace_id, p_lead_id, v_lead.campaign_id, v_agent_id, v_disposition.id, p_notes, now(), now())
    returning * into v_call;
  end if;

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

  update callbacks
  set status = 'done', call_id = v_call.id
  where lead_id = p_lead_id and agent_id = v_agent_id and status = 'pending' and call_id is null;

  return v_call;
end;
$$;
