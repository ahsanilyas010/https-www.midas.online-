-- Section 4.3 — leads and provenance.

create type lead_status as enum
  ('new','screening','ready','assigned','in_progress','callback',
   'contacted','qualified','converted','rejected','unreachable','suppressed');

create type screening_status as enum
  ('unscreened','pending','passed','blocked','expired');

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in
    ('client_supplied','vendor_licensed','public_open_data','public_api',
     'inbound_web_form','referral','manual_entry')),
  market text,
  provider_url text,
  licence_terms_url text,
  lawful_basis text not null check (lawful_basis in
    ('consent','legitimate_interest','contract','not_personal_data')),
  lia_document_path text,
  is_active boolean not null default true,
  config jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table lead_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  data_source_id uuid not null references data_sources(id),
  uploaded_by uuid references profiles(id),
  original_filename text,
  storage_path text,
  acquired_at timestamptz not null,
  column_mapping jsonb,
  rows_total int not null default 0,
  rows_accepted int not null default 0,
  rows_rejected int not null default 0,
  rows_duplicate int not null default 0,
  rows_suppressed int not null default 0,
  status text not null default 'uploaded' check (status in
    ('uploaded','mapping','validating','screening','complete','failed')),
  error_report_path text,
  notes text,
  created_at timestamptz not null default now()
);
create index lead_batches_campaign_idx on lead_batches (campaign_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  batch_id uuid references lead_batches(id),
  data_source_id uuid references data_sources(id),

  external_ref text,
  first_name text,
  last_name text,
  company_name text,
  job_title text,

  phone_e164 text not null,
  phone_raw text,
  phone_type text check (phone_type in ('mobile','landline','voip','unknown')),
  alt_phone_e164 text,
  email text,

  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postcode text,
  country_code text not null,
  lead_timezone text,

  custom jsonb not null default '{}',

  status lead_status not null default 'new',
  assigned_to uuid references profiles(id),
  assigned_at timestamptz,

  screening_status screening_status not null default 'unscreened',
  screened_at timestamptz,
  screening_run_id uuid,
  do_not_call boolean not null default false,
  dnc_reason text,
  dnc_set_at timestamptz,
  consent_status text check (consent_status in
    ('none','implied_b2b','express','express_written','withdrawn')),
  consent_source text,
  consent_captured_at timestamptz,
  consent_evidence_path text,

  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  last_disposition_id uuid,
  next_action_at timestamptz,
  lead_score int,

  retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index leads_campaign_phone_uniq on leads (campaign_id, phone_e164);
create index leads_queue_idx on leads (campaign_id, status, screening_status, next_action_at);
create index leads_assigned_idx on leads (assigned_to, status);
create index leads_phone_idx on leads (phone_e164);
create index leads_search_idx on leads using gin (
  to_tsvector('simple',
    coalesce(first_name,'')||' '||coalesce(last_name,'')||' '||
    coalesce(company_name,'')||' '||coalesce(phone_e164,''))
);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();
