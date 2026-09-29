-- Phase 5, migration 1 of 2 — attendance, shifts and leave requests.

create table shifts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  days_of_week int[] not null default '{1,2,3,4,5}', -- 0=Sunday .. 6=Saturday
  created_at timestamptz not null default now()
);

create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null default current_date,
  unique (workspace_id, user_id, shift_id)
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('clock_in', 'clock_out', 'break_start', 'break_end')),
  occurred_at timestamptz not null default now()
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index attendance_events_workspace_user_idx on attendance_events (workspace_id, user_id, occurred_at desc);
create index shift_assignments_workspace_user_idx on shift_assignments (workspace_id, user_id);
create index leave_requests_workspace_status_idx on leave_requests (workspace_id, status);

alter table shifts enable row level security;
alter table shift_assignments enable row level security;
alter table attendance_events enable row level security;
alter table leave_requests enable row level security;

create policy shifts_select on shifts for select using (workspace_id = auth_workspace_id());
create policy shifts_write on shifts for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create policy shift_assignments_select on shift_assignments for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or user_id = auth.uid() or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
  )
);
create policy shift_assignments_write on shift_assignments for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- Attendance: staff clock themselves in/out; managers and a team_lead (for
-- their own team) see and can also log entries on someone's behalf (a
-- manual correction).
create policy attendance_events_select on attendance_events for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or user_id = auth.uid() or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
  )
);
create policy attendance_events_insert on attendance_events for insert with check (
  workspace_id = auth_workspace_id() and (
    user_id = auth.uid() or is_workspace_manager()
  )
);

create policy leave_requests_select on leave_requests for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or user_id = auth.uid() or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
  )
);
create policy leave_requests_insert on leave_requests for insert with check (
  workspace_id = auth_workspace_id() and user_id = auth.uid()
);
create policy leave_requests_update_manager on leave_requests for update using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

grant select, insert, update, delete on shifts, shift_assignments to authenticated;
grant select, insert on attendance_events to authenticated;
grant select, insert, update on leave_requests to authenticated;
