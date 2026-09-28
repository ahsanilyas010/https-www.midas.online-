-- Zoom integration: meetings booked from the CRM (linked to the lead,
-- campaign and hosting agent) and a small per-provider integrations table
-- for connection state and settings. The demo build serves these from its
-- in-memory store; this migration is for a real Supabase deployment.

create table if not exists integrations (
  id text primary key,
  provider text not null,
  connected boolean not null default false,
  account_email text,
  account_name text,
  plan text,
  connected_at timestamptz,
  connected_by uuid references profiles(id),
  settings jsonb not null default '{}'::jsonb
);

create table if not exists zoom_meetings (
  id uuid primary key default gen_random_uuid(),
  zoom_meeting_id text not null,
  topic text not null,
  agenda text,
  start_time timestamptz not null,
  duration_minutes int not null default 30,
  timezone text not null default 'UTC',
  join_url text not null,
  start_url text not null,
  password text,
  host_id uuid not null references profiles(id),
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  invitee_name text,
  invitee_email text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'started', 'ended', 'cancelled')),
  source text not null default 'zoom' check (source in ('zoom', 'demo')),
  participants int,
  actual_duration_minutes int,
  recording_url text,
  ai_summary text,
  created_at timestamptz not null default now()
);

create index if not exists zoom_meetings_host_start_idx on zoom_meetings (host_id, start_time);
create index if not exists zoom_meetings_lead_idx on zoom_meetings (lead_id);
create index if not exists zoom_meetings_zoom_id_idx on zoom_meetings (zoom_meeting_id);

alter table integrations enable row level security;
alter table zoom_meetings enable row level security;

create policy integrations_select on integrations for select using (auth.uid() is not null);
create policy integrations_write on integrations for all using (is_manager()) with check (is_manager());

-- Agents see and manage their own meetings; managers, team leads and QA
-- see all; client viewers see meetings on their own client's campaigns.
create policy zoom_meetings_select on zoom_meetings for select using (
  host_id = auth.uid()
  or is_manager()
  or auth_role() in ('team_lead', 'qa')
  or (auth_role() = 'client_viewer' and campaign_id in (
    select c.id from campaigns c where c.client_id = (select client_id from profiles where id = auth.uid())
  ))
);
create policy zoom_meetings_insert on zoom_meetings for insert with check (host_id = auth.uid() or is_manager());
create policy zoom_meetings_update on zoom_meetings for update using (host_id = auth.uid() or is_manager());

grant select, insert, update on zoom_meetings to authenticated;
grant select on integrations to authenticated;

create trigger audit_zoom_meetings after insert or update or delete on zoom_meetings
  for each row execute function audit_row_change();
