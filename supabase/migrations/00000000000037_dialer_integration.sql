-- Dialer (telephony) integration: calls placed through the client's own
-- dialer subscription (Zoom Phone, Dialpad, Aircall, RingCentral, Twilio,
-- Vonage, Google Voice). The active provider and its settings live in the
-- `integrations` row with id = 'dialer' (see migration 036); provider
-- credentials belong in encrypted storage (e.g. Supabase Vault), never in
-- that settings JSON. The demo build serves this from its in-memory store.

create table if not exists dialer_calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_call_id text not null,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  from_number text not null,
  to_number text not null,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  agent_id uuid not null references profiles(id),
  status text not null default 'ringing'
    check (status in ('ringing', 'connected', 'on_hold', 'completed', 'missed', 'failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds int not null default 0,
  recording_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists dialer_calls_provider_call_uniq on dialer_calls (provider, provider_call_id);
create index if not exists dialer_calls_agent_started_idx on dialer_calls (agent_id, started_at desc);
create index if not exists dialer_calls_lead_idx on dialer_calls (lead_id);

alter table dialer_calls enable row level security;

create policy dialer_calls_select on dialer_calls for select using (
  agent_id = auth.uid() or is_manager() or auth_role() in ('team_lead', 'qa')
);
create policy dialer_calls_insert on dialer_calls for insert with check (agent_id = auth.uid());
create policy dialer_calls_update on dialer_calls for update using (agent_id = auth.uid() or is_manager());

grant select, insert, update on dialer_calls to authenticated;
