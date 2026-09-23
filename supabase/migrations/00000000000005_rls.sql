-- Section 5 — Row Level Security. Enabled on every table, no exceptions.

create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('super_admin','ops_manager')
$$;

create or replace function my_team_members() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where p.team_id = (select team_id from profiles where id = auth.uid())
$$;

alter table profiles enable row level security;
alter table teams enable row level security;
alter table clients enable row level security;
alter table campaigns enable row level security;
alter table campaign_fields enable row level security;
alter table campaign_assignments enable row level security;
alter table audit_log enable row level security;
alter table user_sessions enable row level security;
alter table credential_events enable row level security;

-- profiles: everyone can read their own row and their team's roster;
-- managers and QA can read everyone; only managers can write, and never
-- their own role (prevents self-escalation).
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_manager()
  or auth_role() = 'qa'
  or (auth_role() = 'team_lead' and team_id = (select team_id from profiles where id = auth.uid()))
);

create policy profiles_insert_manager on profiles for insert
  with check (is_manager());

create policy profiles_update_self on profiles for update using (
  id = auth.uid()
) with check (
  id = auth.uid()
);

create policy profiles_update_manager on profiles for update using (
  is_manager()
) with check (
  is_manager()
);

-- Prevent a non-manager from changing their own role, activation state or
-- credential-lifecycle columns even though profiles_update_self allows the
-- row through — those columns are manager-only.
create or replace function guard_profile_self_update() returns trigger
language plpgsql as $$
begin
  if not is_manager() and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.agent_code is distinct from old.agent_code
       or new.team_id is distinct from old.team_id
       or new.client_id is distinct from old.client_id
       or new.allow_login_outside_shift is distinct from old.allow_login_outside_shift
       or new.must_change_password is distinct from old.must_change_password
    then
      raise exception 'agents cannot change role, team, client, activation or credential-lifecycle fields on their own profile';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_self_update
  before update on profiles
  for each row execute function guard_profile_self_update();

create policy teams_select on teams for select using (auth.uid() is not null);
create policy teams_write on teams for all using (is_manager()) with check (is_manager());

create policy clients_select on clients for select using (
  is_manager() or auth_role() = 'qa'
  or (auth_role() = 'client_viewer'
      and clients.id = (select client_id from profiles where id = auth.uid()))
  or auth_role() in ('team_lead','agent')
);
create policy clients_write on clients for all using (is_manager()) with check (is_manager());

create policy campaigns_select on campaigns for select using (
  is_manager() or auth_role() = 'qa'
  or exists (select 1 from campaign_assignments ca
             where ca.campaign_id = campaigns.id and ca.user_id = auth.uid())
  or (auth_role() = 'client_viewer'
      and client_id = (select client_id from profiles where id = auth.uid()))
  or auth_role() = 'team_lead'
);
create policy campaigns_write on campaigns for all using (is_manager()) with check (is_manager());

create policy campaign_fields_select on campaign_fields for select using (auth.uid() is not null);
create policy campaign_fields_write on campaign_fields for all using (is_manager()) with check (is_manager());

create policy campaign_assignments_select on campaign_assignments for select using (
  is_manager()
  or user_id = auth.uid()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy campaign_assignments_write on campaign_assignments for all
  using (is_manager()) with check (is_manager());

-- Audit log: append-only, readable by managers only. No UPDATE/DELETE
-- policy exists for anyone, including super_admin — that is deliberate.
create policy audit_log_select on audit_log for select using (is_manager());
create policy audit_log_insert on audit_log for insert with check (true);

-- Sessions: own rows, or managers, or a team lead for their team.
create policy user_sessions_select on user_sessions for select using (
  user_id = auth.uid() or is_manager()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy user_sessions_insert on user_sessions for insert with check (
  user_id = auth.uid() or is_manager()
);
create policy user_sessions_update on user_sessions for update using (
  user_id = auth.uid() or is_manager()
);

create policy credential_events_select on credential_events for select using (
  user_id = auth.uid() or is_manager()
);
create policy credential_events_insert on credential_events for insert with check (
  is_manager() or user_id = auth.uid()
);

-- Explicit PostgREST grants. Supabase now requires these rather than
-- relying on implicit exposure (see spec section 1, "cost reality" note).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  profiles, teams, clients, campaigns, campaign_fields, campaign_assignments,
  user_sessions, credential_events
  to authenticated;
grant select, insert on audit_log to authenticated;
grant usage on all sequences in schema public to authenticated;
