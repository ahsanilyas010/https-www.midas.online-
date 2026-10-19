-- Lead Gen seat, 3 of 4 - delivery log for the Zapier / inbound webhook.
-- One row per authenticated delivery to POST /api/leads/inbound (written
-- by the route with the service role; there is deliberately no insert,
-- update or delete policy for any signed-in user). Only the last four digits
-- of the phone number are ever recorded.

create table lead_intake_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token_id uuid references lead_intake_tokens(id) on delete set null,
  received_at timestamptz not null default now(),
  source text,
  http_status int not null,
  outcome text not null check (outcome in ('created', 'duplicate', 'suppressed', 'invalid', 'unauthorized', 'error')),
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  phone_last4 text check (phone_last4 is null or phone_last4 ~ '^[0-9]{1,4}$'),
  error text
);

create index lead_intake_events_workspace_idx on lead_intake_events (workspace_id, received_at desc);
create index lead_intake_events_outcome_idx on lead_intake_events (workspace_id, outcome, received_at desc);

alter table lead_intake_events enable row level security;

create policy lead_intake_events_select on lead_intake_events for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'lead_gen')
);

grant select on lead_intake_events to authenticated;

create trigger lead_intake_events_audit
  after insert or update or delete on lead_intake_events
  for each row execute function audit_row_change('lead_intake_event');
