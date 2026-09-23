-- Section 6.4 — data sourcing: connector fetch history and per-source
-- performance reporting. The connectors themselves (Companies House, UK
-- planning, US permits, vendor CSV, inbound web form) are app-layer code
-- that all funnel through the same commit path as manual entry — nothing
-- here bypasses suppression screening or provenance capture.

create table source_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources(id),
  campaign_id uuid references campaigns(id),
  triggered_by uuid references profiles(id),
  params jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_found int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  error text,
  raw_response_path text
);
create index source_fetch_runs_source_idx on source_fetch_runs (data_source_id, started_at desc);

alter table source_fetch_runs enable row level security;

create policy source_fetch_runs_select on source_fetch_runs for select
  using (auth.uid() is not null);
create policy source_fetch_runs_write on source_fetch_runs for all
  using (is_manager()) with check (is_manager());

grant select, insert, update on source_fetch_runs to authenticated;

-- Source performance: security_invoker so it inherits the caller's RLS on
-- data_sources/leads (both manager-only reads) rather than needing its own
-- role check — same pattern as v_campaign_funnel.
create or replace view v_source_performance
with (security_invoker = true) as
select
  ds.id as data_source_id,
  ds.name,
  ds.source_type,
  ds.market,
  ds.lawful_basis,
  ds.is_active,
  count(l.id) as leads_loaded,
  count(l.id) filter (where l.screening_status = 'passed') as screened_passed,
  count(l.id) filter (where l.do_not_call) as suppressed,
  count(l.id) filter (where l.attempt_count > 0) as worked,
  count(l.id) filter (where l.status in ('contacted', 'qualified', 'converted')) as contacted,
  count(l.id) filter (where l.status = 'qualified') as qualified,
  count(l.id) filter (where l.status = 'converted') as converted,
  coalesce((
    select count(*) from source_fetch_runs sfr where sfr.data_source_id = ds.id
  ), 0) as fetch_run_count,
  (
    select max(sfr.finished_at) from source_fetch_runs sfr where sfr.data_source_id = ds.id
  ) as last_fetched_at
from data_sources ds
left join leads l on l.data_source_id = ds.id
group by ds.id;

grant select on v_source_performance to authenticated;
