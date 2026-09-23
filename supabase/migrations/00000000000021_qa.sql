-- Section 4.10 — QA.

create table qa_scorecards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  name text not null,
  criteria jsonb not null, -- [{key,label,weight,max_score,is_fatal}]
  pass_threshold numeric not null default 80,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table qa_reviews (
  id uuid primary key default gen_random_uuid(),
  call_attempt_id uuid not null references call_attempts(id) on delete cascade,
  scorecard_id uuid not null references qa_scorecards(id),
  reviewer_id uuid not null references profiles(id),
  agent_id uuid not null references profiles(id),
  scores jsonb not null,
  total_score numeric,
  passed boolean,
  fatal_breach boolean not null default false,
  coaching_notes text,
  agent_acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index qa_reviews_agent_idx on qa_reviews (agent_id, created_at desc);
create index qa_reviews_call_idx on qa_reviews (call_attempt_id);

alter table qa_scorecards enable row level security;
alter table qa_reviews enable row level security;

create policy qa_scorecards_select on qa_scorecards for select using (auth.uid() is not null);
create policy qa_scorecards_write on qa_scorecards for all
  using (is_manager() or auth_role() = 'qa') with check (is_manager() or auth_role() = 'qa');

create policy qa_reviews_select on qa_reviews for select using (
  is_manager()
  or auth_role() = 'qa'
  or agent_id = auth.uid()
  or (auth_role() = 'team_lead' and agent_id in (select my_team_members()))
);
create policy qa_reviews_insert on qa_reviews for insert with check (
  is_manager() or auth_role() = 'qa'
);
create policy qa_reviews_update on qa_reviews for update using (
  is_manager() or auth_role() = 'qa' or agent_id = auth.uid()
);

grant select, insert, update, delete on qa_scorecards to authenticated;
grant select, insert, update on qa_reviews to authenticated;

-- Section 4.10 requires these fatal-breach criteria on every scorecard —
-- the exact behaviours the ICO fined companies for. Seed one global
-- default scorecard so QA has something to use from day one.
insert into qa_scorecards (campaign_id, name, criteria, pass_threshold) values (
  null,
  'Standard call quality',
  '[
    {"key":"opening_disclosure","label":"Opening disclosure given","weight":20,"max_score":20,"is_fatal":true},
    {"key":"identified_self_and_client","label":"Caller identified themselves and the client by real name","weight":15,"max_score":15,"is_fatal":true},
    {"key":"offshore_disclosure","label":"Offshore location disclosed if required","weight":15,"max_score":15,"is_fatal":true},
    {"key":"optout_honoured","label":"Opt-out request honoured immediately","weight":20,"max_score":20,"is_fatal":true},
    {"key":"no_false_claims","label":"No false claims about grants, councils, or government schemes","weight":20,"max_score":20,"is_fatal":true},
    {"key":"call_control","label":"Call control and tone","weight":5,"max_score":5,"is_fatal":false},
    {"key":"accurate_notes","label":"Accurate disposition and notes","weight":5,"max_score":5,"is_fatal":false}
  ]'::jsonb,
  80
);
