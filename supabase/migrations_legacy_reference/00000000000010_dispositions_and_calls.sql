-- Section 4.6 — dispositions and call log.

create table dispositions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade, -- null = global
  code text not null,
  label text not null,
  category text not null check (category in
    ('connected_positive','connected_neutral','connected_negative',
     'no_contact','invalid','compliance')),
  is_terminal boolean not null default false,
  sets_dnc boolean not null default false,
  requires_followup boolean not null default false,
  requires_note boolean not null default false,
  requires_email boolean not null default false,
  colour text,
  sort_order int not null default 0,
  unique (campaign_id, code)
);

create table call_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id),
  agent_id uuid not null references profiles(id),
  attempt_no int not null,
  disposition_id uuid references dispositions(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  talk_seconds int,
  wrap_seconds int,
  notes text,
  lead_local_time timestamptz not null,
  within_call_window boolean not null,
  offshore_disclosure_given boolean,
  screening_run_id uuid references suppression_runs(id),
  created_at timestamptz not null default now()
);

create index call_attempts_agent_day_idx on call_attempts (agent_id, started_at);
create index call_attempts_lead_idx on call_attempts (lead_id, started_at desc);

-- Seed dispositions (global). Section 4.6.
insert into dispositions (campaign_id, code, label, category, is_terminal, sets_dnc, requires_followup, requires_note, sort_order) values
  (null, 'connected_interested', 'Connected — Interested', 'connected_positive', false, false, true, false, 10),
  (null, 'connected_callback', 'Connected — Callback Requested', 'connected_neutral', false, false, true, false, 20),
  (null, 'connected_not_interested', 'Connected — Not Interested', 'connected_negative', true, false, false, false, 30),
  (null, 'connected_dnc', 'Connected — Do Not Call', 'compliance', true, true, false, true, 40),
  (null, 'connected_wrong_person', 'Connected — Wrong Person', 'connected_neutral', true, false, false, false, 50),
  (null, 'connected_wrong_number', 'Connected — Wrong Number', 'invalid', true, false, false, false, 60),
  (null, 'connected_gatekeeper', 'Connected — Gatekeeper', 'connected_neutral', false, false, false, false, 70),
  (null, 'no_answer', 'No Answer', 'no_contact', false, false, false, false, 80),
  (null, 'busy', 'Busy', 'no_contact', false, false, false, false, 90),
  (null, 'voicemail', 'Voicemail', 'no_contact', false, false, false, false, 100),
  (null, 'invalid_number', 'Invalid Number', 'invalid', true, false, false, false, 110),
  (null, 'language_barrier', 'Language Barrier', 'connected_neutral', true, false, false, false, 120),
  (null, 'already_customer', 'Already a Customer', 'connected_neutral', true, false, false, false, 130),
  (null, 'outside_calling_hours', 'Outside Calling Hours', 'compliance', true, false, false, true, 140);
