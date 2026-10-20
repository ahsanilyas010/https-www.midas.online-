-- Per-user state for the product tour and the dashboard setup checklist.
create table user_guide_state (
  user_id uuid primary key references profiles(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  tour_seen_at timestamptz,
  tour_completed_at timestamptz,
  checklist_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_guide_state_workspace_idx on user_guide_state (workspace_id);

create trigger user_guide_state_set_updated_at
  before update on user_guide_state
  for each row execute function set_updated_at();

alter table user_guide_state enable row level security;

-- A user reads and writes only their own row, in their own workspace.
create policy user_guide_state_select on user_guide_state for select
  using (user_id = auth.uid() and workspace_id = auth_workspace_id());
create policy user_guide_state_insert on user_guide_state for insert
  with check (user_id = auth.uid() and workspace_id = auth_workspace_id());
create policy user_guide_state_update on user_guide_state for update
  using (user_id = auth.uid() and workspace_id = auth_workspace_id())
  with check (user_id = auth.uid() and workspace_id = auth_workspace_id());

revoke all on user_guide_state from anon, authenticated;
grant select, insert, update on user_guide_state to authenticated;
