-- Section 4.4 — suppression, the compliance gate. Global, permanent,
-- append-only in spirit: no UPDATE policy exists, only super_admin can
-- DELETE, and that deletion is itself audited.

create type suppression_reason as enum
  ('internal_optout','verbal_dnc','tps','ctps','us_national_dnc','state_dnc',
   'client_supplied_dnc','complaint','litigator','deceased','wrong_number',
   'invalid_number','duplicate_entity','vulnerable_person');

create table suppression_list (
  phone_e164 text primary key,
  reason suppression_reason not null,
  market text,
  source text,
  added_by uuid references profiles(id),
  lead_id uuid,
  evidence_note text,
  is_permanent boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table suppression_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references lead_batches(id),
  campaign_id uuid references campaigns(id),
  provider text not null,
  ran_by uuid references profiles(id),
  numbers_submitted int,
  numbers_matched int,
  evidence_path text,
  provider_reference text,
  ran_at timestamptz not null default now(),
  valid_until timestamptz
);
create index suppression_runs_campaign_idx on suppression_runs (campaign_id, ran_at desc);
