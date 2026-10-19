-- Zoom meetings booked from the platform. The host start_url is never stored
-- (it is a bearer link to host the meeting); it is fetched fresh from Zoom.

create table zoom_meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  host_id uuid not null references profiles(id),
  zoom_meeting_id text not null,
  topic text not null,
  agenda text,
  start_time timestamptz not null,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  timezone text not null default 'UTC',
  join_url text not null,
  password text,
  status text not null default 'scheduled' check (status in ('scheduled', 'started', 'ended', 'cancelled')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zoom_meetings_workspace_start_idx on zoom_meetings (workspace_id, start_time);
create index zoom_meetings_host_idx on zoom_meetings (host_id, start_time);
create index zoom_meetings_lead_idx on zoom_meetings (lead_id);

create trigger zoom_meetings_set_updated_at
  before update on zoom_meetings
  for each row execute function set_updated_at();

create trigger zoom_meetings_audit
  after insert or update or delete on zoom_meetings
  for each row execute function audit_row_change('zoom_meeting');

alter table zoom_meetings enable row level security;

create policy zoom_meetings_select on zoom_meetings for select using (
  workspace_id = auth_workspace_id()
  and (
    is_workspace_manager()
    or (auth_role() = 'team_lead' and host_id in (select my_team_members()))
    or (auth_role() = 'agent' and (
      host_id = auth.uid()
      or lead_id in (select l.id from leads l where l.assigned_to = auth.uid())
    ))
  )
);

create policy zoom_meetings_insert on zoom_meetings for insert with check (
  workspace_id = auth_workspace_id()
  and created_by = auth.uid()
  and (
    is_workspace_manager()
    or (auth_role() in ('team_lead', 'agent') and host_id = auth.uid())
  )
);

create policy zoom_meetings_update on zoom_meetings for update using (
  workspace_id = auth_workspace_id()
  and (is_workspace_manager() or (auth_role() in ('team_lead', 'agent') and host_id = auth.uid()))
) with check (
  workspace_id = auth_workspace_id()
  and (is_workspace_manager() or (auth_role() in ('team_lead', 'agent') and host_id = auth.uid()))
);

revoke all on zoom_meetings from anon;
grant select, insert, update on zoom_meetings to authenticated;
