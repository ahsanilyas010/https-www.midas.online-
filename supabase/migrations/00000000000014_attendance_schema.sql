-- Section 4.9 — attendance and workforce.

create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Asia/Karachi',
  days_of_week int[] not null default '{1,2,3,4,5,6}',
  grace_minutes int not null default 10,
  break_allowance_minutes int not null default 60,
  crosses_midnight boolean generated always as (end_time < start_time) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  shift_id uuid not null references shifts(id),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);
create index shift_assignments_user_idx on shift_assignments (user_id, effective_from desc);

create type attendance_status as enum
  ('present','late','absent','half_day','on_leave','holiday','week_off','wfh');

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  shift_id uuid references shifts(id),
  work_date date not null,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  clock_in_ip inet,
  clock_out_ip inet,
  clock_in_device text,
  status attendance_status,
  late_minutes int not null default 0,
  early_leave_minutes int not null default 0,
  worked_minutes int not null default 0,
  break_minutes int not null default 0,
  productive_minutes int not null default 0,
  is_manual_entry boolean not null default false,
  manual_reason text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  agent_note text,
  lead_note text,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);
create index attendance_sessions_user_idx on attendance_sessions (user_id, work_date desc);

create type aux_state as enum
  ('available','on_call','after_call_work','break','lunch','prayer',
   'meeting','training','system_issue','idle','offline');

create table aux_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id),
  state aux_state not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  reason text
);
create index aux_logs_session_idx on aux_logs (session_id, started_at);
-- No overlaps: at most one open (ended_at is null) aux_log row per session.
-- Enforced at the DB level with a partial unique index rather than a
-- trigger — same guarantee, and the set_aux_state() RPC (next migration)
-- is what actually closes-then-opens atomically.
create unique index aux_logs_one_open_per_session on aux_logs (session_id) where ended_at is null;

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  leave_type text not null check (leave_type in
    ('annual','sick','casual','unpaid','bereavement','other')),
  from_date date not null,
  to_date date not null,
  is_half_day boolean not null default false,
  reason text,
  status text not null default 'pending' check (status in
    ('pending','approved','rejected','cancelled')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index leave_requests_user_idx on leave_requests (user_id, created_at desc);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null,
  market text,
  unique (holiday_date, market)
);
