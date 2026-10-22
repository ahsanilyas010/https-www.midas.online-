-- Admins and ops managers can dial their own uploaded data, so they may now be
-- put on a campaign roster (the dial queue, next_lead_for_agent, is driven by
-- the roster). Everything else in the guard is unchanged: same workspace, the
-- profile must be active, and the campaign must be in that workspace. The
-- compliance gate itself (next_lead_for_agent) is NOT touched: a lead is still
-- only served when it is screened, unsuppressed, on a campaign the caller is
-- rostered on, and unassigned or assigned to the caller.
create or replace function guard_campaign_assignment() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from campaigns c where c.id = new.campaign_id and c.workspace_id = new.workspace_id) then
    raise exception 'campaign must belong to the assignment''s workspace';
  end if;
  if not exists (
    select 1 from profiles p
    where p.id = new.user_id and p.workspace_id = new.workspace_id
      and p.role in ('agent', 'team_lead', 'super_admin', 'ops_manager') and p.is_active
  ) then
    raise exception 'only active agents, team leads or managers in this workspace can be assigned to a campaign';
  end if;
  return new;
end;
$$;
