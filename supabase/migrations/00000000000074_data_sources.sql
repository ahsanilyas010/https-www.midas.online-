-- Slice C: data sourcing. Every lead traces back to a registered data
-- source that carries a lawful basis (spec 6.4: "a record with no
-- lawful_basis cannot be committed"). The legacy API connectors
-- (Companies House / PlanIt / Socrata) were simulated and are gone: the
-- one real ingestion path is a vendor / client file import, which creates
-- a lead_batch + leads exactly like /admin/settings/leads does, tagged with
-- the data source.

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in
    ('client_supplied', 'vendor_licensed', 'public_open_data', 'inbound_web_form', 'referral', 'manual_entry')),
  market text,
  provider_url text,
  licence_terms_url text,
  lawful_basis text not null check (lawful_basis in
    ('consent', 'legitimate_interest', 'contract', 'not_personal_data')),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index data_sources_workspace_idx on data_sources (workspace_id);

-- One row per import run (file import), success or failure, so a failed run
-- is as visible as a good one.
create table source_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  data_source_id uuid not null references data_sources(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  batch_id uuid references lead_batches(id),
  triggered_by uuid references auth.users(id),
  params jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_found int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  records_unphoned int not null default 0,
  status text not null default 'running' check (status in ('running', 'complete', 'failed')),
  error text
);
create index source_fetch_runs_source_idx on source_fetch_runs (workspace_id, data_source_id, started_at desc);

-- Lead provenance.
alter table leads add column if not exists data_source_id uuid references data_sources(id);
alter table lead_batches add column if not exists data_source_id uuid references data_sources(id);
create index if not exists leads_data_source_idx on leads (workspace_id, data_source_id);

alter table data_sources enable row level security;
alter table source_fetch_runs enable row level security;

create policy data_sources_select on data_sources for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);
create policy data_sources_write on data_sources for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

create policy source_fetch_runs_select on source_fetch_runs for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
);
-- Importers are managers and team leads (same set that may upload leads in
-- the app); only managers may delete runs.
create policy source_fetch_runs_insert on source_fetch_runs for insert with check (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
);
create policy source_fetch_runs_update on source_fetch_runs for update using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
) with check (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
);

grant select, insert, update, delete on data_sources to authenticated;
grant select, insert, update on source_fetch_runs to authenticated;

create trigger data_sources_audit
  after insert or update or delete on data_sources
  for each row execute function audit_row_change('data_source');
create trigger source_fetch_runs_audit
  after insert or update or delete on source_fetch_runs
  for each row execute function audit_row_change('source_fetch_run');
