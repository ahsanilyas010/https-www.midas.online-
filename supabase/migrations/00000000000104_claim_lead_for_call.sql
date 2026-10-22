-- Call sheet, part 2: claim one specific lead for the signed-in caller, with the
-- same gate as the dial queue. The lead row is locked, the block reason is
-- re-evaluated inside the transaction, and only if it is clear is the lead
-- claimed exactly like next_lead_for_agent() does (claimed_by / claimed_at).
-- Two agents racing for the same lead: the second waits on the row lock, then
-- sees the first claim and is refused.
create or replace function claim_lead_for_call(p_lead_id uuid) returns leads
language plpgsql security definer set search_path = public as $$
declare
  v_agent_id uuid := auth.uid();
  v_lead leads;
  v_reason text;
begin
  if v_agent_id is null then
    raise exception 'Not signed in.';
  end if;
  if auth_role() not in ('super_admin', 'ops_manager', 'team_lead', 'agent') then
    raise exception 'Only dialing staff can claim a lead.';
  end if;

  select * into v_lead from leads where id = p_lead_id and workspace_id = auth_workspace_id() for update;
  if v_lead.id is null then
    raise exception 'Lead not found.';
  end if;

  v_reason := lead_dial_block_reason(p_lead_id, v_agent_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  update leads set claimed_by = v_agent_id, claimed_at = now() where id = v_lead.id returning * into v_lead;
  return v_lead;
end;
$$;
revoke execute on function claim_lead_for_call(uuid) from public, anon;
grant execute on function claim_lead_for_call(uuid) to authenticated;
