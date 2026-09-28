-- Phase 1, migration 4 of 9 — campaigns. Full column set from the spec's
-- DOMAIN section; compliance-gate enforcement (next_lead_for_agent) is
-- Phase 2 — these columns just need to exist so the onboarding wizard's
-- "first campaign" step and Phase 2's gate function both have somewhere
-- real to read from.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_id uuid references clients(id),
  name text not null,
  vertical text,
  country text,
  timezone text not null default 'UTC',
  caller_id text,
  calling_window_start time,
  calling_window_end time,
  max_attempts int not null default 6,
  cooling_off_hours int not null default 24,
  recording_enabled boolean not null default false,
  disclosure_script text,
  objection_notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index campaigns_workspace_idx on campaigns (workspace_id);
create index campaigns_workspace_client_idx on campaigns (workspace_id, client_id);
create index campaign_assignments_workspace_idx on campaign_assignments (workspace_id);
create index campaign_assignments_user_idx on campaign_assignments (user_id);

create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();
