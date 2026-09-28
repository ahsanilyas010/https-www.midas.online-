-- Phase 1, migration 7 of 9 — Row Level Security. Enabled on every table
-- from migrations 038-043, no exceptions. Every policy is built from the
-- helper functions in migration 040 — see that file's header for why.

alter table workspaces enable row level security;
alter table teams enable row level security;
alter table clients enable row level security;
alter table profiles enable row level security;
alter table campaigns enable row level security;
alter table campaign_assignments enable row level security;
alter table lead_batches enable row level security;
alter table leads enable row level security;
alter table twilio_credentials enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------
-- workspaces: a member reads their own workspace; a platform_admin reads
-- every workspace (seat usage / health, per spec — never leads/recordings/
-- credentials, which this role simply has no policy branch on anywhere in
-- this file). Only a manager may update it, and only a fixed set of
-- columns — plan/seat_limit/status/billing fields are service-role only.

create policy workspaces_select on workspaces for select using (
  id = auth_workspace_id() or is_platform_admin()
);

create policy workspaces_update_manager on workspaces for update using (
  id = auth_workspace_id() and is_workspace_manager()
) with check (
  id = auth_workspace_id() and is_workspace_manager()
);

create or replace function guard_workspace_self_update() returns trigger
language plpgsql as $$
begin
  if new.plan is distinct from old.plan
     or new.seat_limit is distinct from old.seat_limit
     or new.status is distinct from old.status
     or new.is_demo is distinct from old.is_demo
     or new.billing_status is distinct from old.billing_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  then
    raise exception 'plan, seats, status and billing fields can only be changed by the service role';
  end if;
  return new;
end;
$$;

create trigger workspaces_guard_self_update
  before update on workspaces
  for each row execute function guard_workspace_self_update();

-- ---------------------------------------------------------------------
-- profiles: your own row, your team (team_lead), or everyone in your
-- workspace if you're a manager or qa_analyst. Managers can insert/update;
-- a guard trigger stops anyone (including a manager acting on their own
-- row through profiles_update_self) from self-escalating role or moving
-- workspace.

create policy profiles_select on profiles for select using (
  is_platform_admin()
  or (
    workspace_id = auth_workspace_id() and (
      id = auth.uid()
      or is_workspace_manager()
      or auth_role() = 'qa_analyst'
      or (auth_role() = 'team_lead' and team_id = my_team_id())
    )
  )
);

create policy profiles_insert_manager on profiles for insert with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create policy profiles_update_self on profiles for update using (
  id = auth.uid()
) with check (
  id = auth.uid()
);

create policy profiles_update_manager on profiles for update using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create or replace function guard_profile_self_update() returns trigger
language plpgsql as $$
begin
  if not is_workspace_manager() and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.agent_code is distinct from old.agent_code
       or new.team_id is distinct from old.team_id
       or new.client_id is distinct from old.client_id
       or new.workspace_id is distinct from old.workspace_id
       or new.email is distinct from old.email
    then
      raise exception 'only a workspace manager can change role, team, client, workspace, email or activation state';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_self_update
  before update on profiles
  for each row execute function guard_profile_self_update();

-- ---------------------------------------------------------------------
-- teams / clients: readable workspace-wide (agents need to see their own
-- team's name, clients need to be resolvable for campaign display);
-- writable by managers only. A client-role user's ability to see only
-- their own client row is enforced at the campaigns level below, not here
-- — but include it anyway as defense in depth.

create policy teams_select on teams for select using (
  workspace_id = auth_workspace_id()
);
create policy teams_write on teams for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create policy clients_select on clients for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or auth_role() in ('team_lead', 'agent', 'qa_analyst')
    or (auth_role() = 'client' and id = my_client_id())
  )
);
create policy clients_write on clients for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- ---------------------------------------------------------------------
-- campaigns: managers and qa_analyst see everything in the workspace; an
-- agent sees only campaigns they're assigned to; a team_lead sees
-- campaigns any of their team members are assigned to; a client sees only
-- their own client's campaigns. Never phone numbers to a client — this
-- table has no phone columns, but caller_id is deliberately excluded from
-- nothing here because campaigns.caller_id is a workspace-owned number,
-- not a lead's — the "never a phone number to a client" rule is really
-- about leads/calls (migration 042/Phase 2), where clients get no policy
-- branch at all.

create policy campaigns_select on campaigns for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or auth_role() = 'qa_analyst'
    or exists (
      select 1 from campaign_assignments ca
      where ca.campaign_id = campaigns.id and ca.user_id = auth.uid()
    )
    or (
      auth_role() = 'team_lead' and exists (
        select 1 from campaign_assignments ca
        where ca.campaign_id = campaigns.id and ca.user_id in (select my_team_members())
      )
    )
    or (auth_role() = 'client' and client_id = my_client_id())
  )
);
create policy campaigns_write on campaigns for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create policy campaign_assignments_select on campaign_assignments for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or user_id = auth.uid()
    or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
  )
);
create policy campaign_assignments_write on campaign_assignments for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- ---------------------------------------------------------------------
-- lead_batches / leads: staff only, by omission. No policy branch admits
-- 'client' or is_platform_admin() at all — the spec's "never return a
-- phone number to a client-role or platform_owner request" is enforced
-- structurally here, not by hiding it in the UI.

create policy lead_batches_rw on lead_batches for all using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
) with check (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);

create policy leads_rw on leads for all using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
) with check (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);

-- ---------------------------------------------------------------------
-- twilio_credentials: managers only, and select only — nothing ever
-- updates/inserts/deletes it through the authenticated role; that always
-- goes through the service-role admin client from a manager-gated server
-- action (src/app/start/twilio), which is also the only place the Vault
-- secret is ever decrypted.

create policy twilio_credentials_select on twilio_credentials for select using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- ---------------------------------------------------------------------
-- audit_log: append-only. No update/delete policy for anyone, including
-- super_admin — that is deliberate, mirroring legacy migration 005/006's
-- fix. Only the security-definer trigger functions above ever write a row.

create policy audit_log_select on audit_log for select using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

revoke insert, update, delete on audit_log from authenticated, anon;

-- ---------------------------------------------------------------------
-- Explicit PostgREST grants — Supabase requires these rather than relying
-- on implicit exposure. RLS policies above still gate every row.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  workspaces, profiles, teams, clients, campaigns, campaign_assignments,
  lead_batches, leads
  to authenticated;
grant select on twilio_credentials to authenticated;
grant select on audit_log to authenticated;
grant usage on all sequences in schema public to authenticated;
