-- Section 4.2 — campaigns, with the vertical/risk_tier compliance preset
-- columns folded in at creation time rather than as a later alter.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  code text unique not null,
  market text not null check (market in ('UK','US','PK','OTHER')),
  audience text not null check (audience in ('B2C','B2B')),

  call_window_start time not null default '09:00',
  call_window_end   time not null default '20:00',
  call_days int[] not null default '{1,2,3,4,5,6}',

  requires_tps_screening boolean not null default false,
  requires_ctps_screening boolean not null default false,
  requires_us_dnc_screening boolean not null default false,
  screening_max_age_days int not null default 28,
  max_attempts int not null default 6,
  min_hours_between_attempts int not null default 24,
  requires_offshore_disclosure boolean not null default true,

  script_md text,
  objection_handling_md text,
  opening_disclosure text,

  vertical text not null default 'general'
    check (vertical in ('home_improvement','digital_marketing','financial',
                        'utilities_energy','insurance','healthcare',
                        'lead_qualification','customer_service','general')),
  risk_tier text not null default 'standard'
    check (risk_tier in ('standard','elevated','high')),
  vertical_preset_overridden boolean not null default false,
  dpa_reference text, -- required before activation when risk_tier = 'high'

  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index campaigns_client_idx on campaigns (client_id);
create index campaigns_market_idx on campaigns (market);

create table campaign_fields (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null check (field_type in
    ('text','number','date','select','multiselect','boolean','currency','textarea')),
  options jsonb,
  is_required boolean not null default false,
  show_in_list boolean not null default false,
  sort_order int not null default 0,
  unique (campaign_id, key)
);

create table campaign_assignments (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  daily_target int,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_assignments_user_idx on campaign_assignments (user_id);
