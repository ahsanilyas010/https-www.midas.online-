-- Phase 1, migration 3 of 9 — teams, clients, profiles, and the
-- auth-context helper functions every RLS policy from here on is built
-- from.
--
-- Standing rule for every migration after this one: an RLS policy must
-- never subquery the table it protects (or profiles from within profiles'
-- own policy) inline. Always go through one of the functions below. Legacy
-- migration 00000000000012_fix_rls_recursion_and_suppression_read.sql had
-- to patch exactly that bug (profiles_select's team_lead branch selecting
-- from profiles within profiles' own policy caused Postgres error 42P17,
-- infinite recursion) after the fact, once real per-role testing caught it
-- — a bug invisible under service-role/superuser testing, which bypasses
-- RLS entirely. Centralizing the lookups here, before any policy is
-- written, avoids that class of bug from the start.

create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  team_lead_id uuid, -- FK to profiles added below, once profiles exists
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  country text,
  contact_name text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  -- Denormalized from auth.users so the app (login persona picker, People
  -- page, invites) never needs the service-role admin API just to display
  -- or match on an email address. Kept in sync at creation time only in
  -- Phase 1 — a real "change my email" flow (which must touch auth.users
  -- too) is a later-phase concern.
  email text not null,
  full_name text not null,
  agent_code text,
  role app_role not null default 'agent',
  team_id uuid references teams(id),
  client_id uuid references clients(id), -- only meaningful for role = 'client'
  phone text,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  joined_on date,
  must_change_password boolean not null default true,
  password_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table teams
  add constraint teams_team_lead_id_fkey
  foreign key (team_lead_id) references profiles(id);

create unique index profiles_workspace_agent_code_idx
  on profiles (workspace_id, agent_code) where agent_code is not null;
create index profiles_workspace_idx on profiles (workspace_id);
create index profiles_workspace_role_idx on profiles (workspace_id, role);
create index profiles_workspace_team_idx on profiles (workspace_id, team_id);
create index profiles_workspace_client_idx on profiles (workspace_id, client_id);
create index teams_workspace_idx on teams (workspace_id);
create index clients_workspace_idx on clients (workspace_id);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Auth-context helpers. security definer + stable, so they run with this
-- function's privileges (bypassing the caller's own RLS on profiles —
-- otherwise looking up your own workspace_id would itself require a
-- policy that needs your workspace_id) and are safe to call repeatedly
-- within one statement's plan.

create or replace function auth_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_workspace_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('super_admin', 'ops_manager')
$$;

create or replace function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid()
$$;

create or replace function my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from profiles where id = auth.uid()
$$;

create or replace function my_team_members() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where team_id = my_team_id()
$$;

revoke execute on function
  auth_workspace_id(), auth_role(), is_workspace_manager(),
  my_team_id(), my_client_id(), my_team_members()
  from public, anon;
grant execute on function
  auth_workspace_id(), auth_role(), is_workspace_manager(),
  my_team_id(), my_client_id(), my_team_members()
  to authenticated;
