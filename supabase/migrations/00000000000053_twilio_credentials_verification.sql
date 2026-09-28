-- Phase 3, migration 1 of 6 — Twilio credential verification support.
-- Verification itself (a real Twilio REST call) happens in application
-- code (src/lib/twilio/verify.ts); this is the storage it writes to, and
-- the one function that ever decrypts the auth token.

alter table twilio_credentials
  add column twiml_app_sid text,
  add column caller_id_default text,
  add column verified_at timestamptz,
  add column last_error text;

-- Numbers the workspace owns on Twilio, synced at verification time.
-- campaign.caller_id is validated against this table in application code
-- (spec: "campaign.caller_id may only be a number that workspace owns").
create table twilio_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  phone_number text not null,
  friendly_name text,
  capabilities jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (workspace_id, phone_number)
);

alter table twilio_numbers enable row level security;
create policy twilio_numbers_select on twilio_numbers for select using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
grant select on twilio_numbers to authenticated;

-- The only place a raw Twilio auth token is ever decrypted. service_role
-- only — called exclusively from src/lib/twilio/credentials.ts on the
-- server, never from an authenticated session, never logged (spec:
-- "Never log recordings, phone numbers or Twilio secrets to console or
-- error trackers").
create or replace function get_twilio_auth_token(p_workspace_id uuid) returns text
language sql security definer set search_path = public as $$
  select vault.decrypted_secrets.decrypted_secret
  from twilio_credentials
  join vault.decrypted_secrets on vault.decrypted_secrets.id = twilio_credentials.auth_token_secret_id
  where twilio_credentials.workspace_id = p_workspace_id
$$;

revoke execute on function get_twilio_auth_token(uuid) from public, anon, authenticated;
grant execute on function get_twilio_auth_token(uuid) to service_role;
