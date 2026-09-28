-- Phase 2, migration 3 of 7 — dispositions (a fixed, global taxonomy —
-- not per-workspace: the outcomes a call can end in are universal, not
-- something each tenant customizes), calls and callbacks.
--
-- calls here is deliberately minimal — no Twilio-specific columns
-- (provider call SID, recording path, status-callback timestamps). Those
-- are added by Phase 3's migrations once the dialer is real; this phase
-- only needs somewhere for record_call_attempt() (migration 051) to log
-- that an attempt happened, which is what the compliance gate's
-- attempts/last_attempt_at/cooling-off checks are actually built on.

create table dispositions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  -- Spec's four reporting groups (funnel/scorecard rollups, Phase 6).
  outcome_group text not null check (outcome_group in ('connect', 'no_connect', 'dnc', 'conversion')),
  is_terminal boolean not null default true,
  sets_dnc boolean not null default false,
  requires_followup boolean not null default false,
  requires_note boolean not null default false,
  sort int not null default 0
);

insert into dispositions (code, label, outcome_group, is_terminal, sets_dnc, requires_followup, requires_note, sort) values
  ('connected_interested', 'Connected — Interested', 'connect', false, false, true, false, 10),
  ('connected_callback', 'Connected — Callback Requested', 'connect', false, false, true, false, 20),
  ('connected_not_interested', 'Connected — Not Interested', 'connect', true, false, false, false, 30),
  ('connected_dnc', 'Connected — Do Not Call', 'dnc', true, true, false, true, 40),
  ('connected_wrong_person', 'Connected — Wrong Person', 'connect', true, false, false, false, 50),
  ('connected_wrong_number', 'Connected — Wrong Number', 'no_connect', true, false, false, false, 60),
  ('connected_gatekeeper', 'Connected — Gatekeeper', 'connect', false, false, false, false, 70),
  ('no_answer', 'No Answer', 'no_connect', false, false, false, false, 80),
  ('busy', 'Busy', 'no_connect', false, false, false, false, 90),
  ('voicemail', 'Voicemail', 'no_connect', false, false, false, false, 100),
  ('invalid_number', 'Invalid Number', 'no_connect', true, false, false, false, 110),
  ('language_barrier', 'Language Barrier', 'connect', true, false, false, false, 120),
  ('already_customer', 'Already a Customer', 'connect', true, false, false, false, 130),
  ('outside_calling_hours', 'Outside Calling Hours', 'no_connect', true, false, false, true, 140),
  ('project_finished', 'Project Finished', 'connect', true, false, false, false, 150),
  ('answering_machine', 'Answering Machine', 'no_connect', false, false, false, false, 160),
  ('number_busy', 'Number Busy', 'no_connect', false, false, false, false, 170),
  ('schedule_callback', 'Schedule Call Back', 'connect', false, false, true, false, 180),
  ('dead_air', 'Dead Air', 'no_connect', false, false, false, false, 190),
  ('do_not_call', 'Do Not Call', 'dnc', true, true, false, true, 200),
  ('not_interested', 'Not Interested', 'connect', true, false, false, false, 210),
  ('hang_up', 'Hang Up', 'connect', true, false, false, false, 220),
  ('appointment_set', 'Appointment set', 'conversion', true, false, true, false, 230),
  ('not_available', 'Not Available', 'no_connect', false, false, false, false, 240),
  ('email_sent_no_call', 'Email Sent / No call', 'no_connect', false, false, false, false, 250),
  ('email_sent_and_called', 'Email Sent and Called', 'connect', false, false, false, false, 260),
  ('interested_follow_up', 'Interested — Follow up', 'connect', false, false, true, false, 270),
  ('number_disconnected', 'Number Disconnected', 'no_connect', true, false, false, false, 280),
  ('wrong_person', 'Wrong Person', 'connect', true, false, false, false, 290),
  ('already_have_team', 'Already Has a Team', 'connect', true, false, false, false, 300);

create table calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  agent_id uuid not null references auth.users(id),
  disposition_id uuid references dispositions(id),
  notes text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table callbacks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  call_id uuid references calls(id),
  agent_id uuid references auth.users(id),
  due_at timestamptz not null,
  snooze_count int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'escalated', 'cancelled')),
  created_at timestamptz not null default now()
);

create index calls_workspace_idx on calls (workspace_id, created_at desc);
create index calls_lead_idx on calls (lead_id);
create index calls_agent_idx on calls (workspace_id, agent_id, created_at desc);
create index callbacks_workspace_due_idx on callbacks (workspace_id, status, due_at);
create index callbacks_agent_idx on callbacks (workspace_id, agent_id, status, due_at);

alter table dispositions enable row level security;
alter table calls enable row level security;
alter table callbacks enable row level security;

-- dispositions: readable by any signed-in staff member (it's a fixed
-- taxonomy, not sensitive); no per-tenant write path exists in Phase 2.
create policy dispositions_select on dispositions for select using (auth.uid() is not null);

create policy calls_select on calls for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or auth_role() = 'qa_analyst'
    or agent_id = auth.uid()
    or (auth_role() = 'team_lead' and agent_id in (select my_team_members()))
  )
);
-- Inserts/updates to calls only ever happen through record_call_attempt()
-- (migration 051, security definer) — no direct insert/update policy for
-- any role, so the compliance bookkeeping (attempts, last_attempt_at,
-- suppression) can never be bypassed by writing a calls row directly.

create policy callbacks_select on callbacks for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or agent_id = auth.uid()
    or (auth_role() = 'team_lead' and agent_id in (select my_team_members()))
  )
);
create policy callbacks_update on callbacks for update using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or agent_id = auth.uid()
  )
) with check (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or agent_id = auth.uid()
  )
);

grant select on dispositions to authenticated;
grant select on calls to authenticated;
grant select, update on callbacks to authenticated;
