-- Section 4.1 — identity and org. Table order is adjusted from the spec's
-- reading order to satisfy FK dependencies: clients and teams before
-- profiles, then teams.team_lead_id is added afterwards.

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact_name text,
  contact_email text,
  contract_ref text,
  is_data_controller boolean not null default false,
  dpa_signed_on date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_lead_id uuid, -- FK to profiles added below, once profiles exists
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  agent_code text unique,
  role app_role not null default 'agent',
  team_id uuid references teams(id),
  client_id uuid references clients(id), -- only meaningful for client_viewer
  phone text,
  timezone text not null default 'Asia/Karachi',
  is_active boolean not null default true,
  joined_on date,

  -- Section 3.1 — credential lifecycle and session controls.
  must_change_password boolean not null default true,
  password_set_at timestamptz,
  last_login_at timestamptz,
  last_login_ip inet,
  failed_login_count int not null default 0,
  locked_until timestamptz,
  allow_login_outside_shift boolean not null default false,
  totp_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table teams
  add constraint teams_team_lead_id_fkey
  foreign key (team_lead_id) references profiles(id);

create index profiles_team_idx on profiles (team_id);
create index profiles_client_idx on profiles (client_id);
create index profiles_role_idx on profiles (role);

create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  ended_at timestamptz,
  ip inet,
  user_agent text,
  ended_reason text check (ended_reason in
    ('logout','idle_timeout','forced','shift_end'))
);
create index user_sessions_active_idx on user_sessions (user_id, ended_at);

-- Credential lifecycle. Never contains a password, only events about one.
create table credential_events (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id),
  event text not null check (event in
    ('created','temp_issued','changed_by_user','reset_by_admin',
     'locked','unlocked','2fa_enabled','2fa_disabled','force_logout')),
  ip inet,
  note text,
  created_at timestamptz not null default now()
);
create index credential_events_user_idx on credential_events (user_id, created_at desc);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();
