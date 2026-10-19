-- Call transfer (agent -> team lead / admin).
--
-- Every call now runs through a Twilio conference room instead of a direct
-- <Dial><Number> bridge, because a bridged call can't be handed to a third
-- party without dropping the other side. calls.conference_name is that room;
-- calls.lead_call_sid is the outbound leg to the customer (provider_call_sid
-- stays the agent's browser leg, so existing status and talk-time logic is
-- unchanged).
alter table calls
  add column conference_name text,
  add column lead_call_sid text;

create unique index calls_workspace_lead_sid_idx on calls (workspace_id, lead_call_sid) where lead_call_sid is not null;
create index calls_workspace_conference_idx on calls (workspace_id, conference_name) where conference_name is not null;

create table call_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  mode text not null check (mode in ('warm', 'cold')),
  status text not null default 'ringing'
    check (status in ('ringing', 'connected', 'completed', 'cancelled', 'declined', 'failed')),
  to_call_sid text,
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  completed_at timestamptz,
  check (from_user <> to_user)
);

create index call_transfers_workspace_idx on call_transfers (workspace_id, created_at desc);
create index call_transfers_call_idx on call_transfers (call_id);
create unique index call_transfers_to_sid_idx on call_transfers (to_call_sid) where to_call_sid is not null;
-- One live transfer per call at a time.
create unique index call_transfers_one_live_per_call_idx on call_transfers (call_id) where status in ('ringing', 'connected');

alter table call_transfers enable row level security;

-- Written only by server actions / Twilio webhooks with the service role
-- (they validate the caller and the Twilio signature themselves); everyone
-- else just reads.
create policy call_transfers_select on call_transfers for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager()
    or from_user = auth.uid()
    or to_user = auth.uid()
  )
);
grant select on call_transfers to authenticated;

create trigger call_transfers_audit
  after insert or update or delete on call_transfers
  for each row execute function audit_row_change('call_transfer');
