-- Phase 1, migration 5 of 9 — deliberately minimal shells for leads and
-- Twilio credentials.
--
-- lead_batches/leads: no ingestion, dedup or screening logic here — that's
-- Phase 2's compliance gate work (next_lead_for_agent, suppression_list,
-- screening). These exist only so the onboarding wizard's "first data
-- upload" step (src/app/start/data) has a real table to write batch
-- metadata against.
--
-- twilio_credentials: storage only. Live verification, listing owned
-- numbers, and the "Call button disabled until connected" UX are Phase 3.
-- The auth token is never stored in this table — auth_token_secret_id
-- points at a Supabase Vault secret created via vault.create_secret().
-- Requires the `supabase_vault` extension enabled on the project (a
-- Dashboard toggle — see README "must configure by hand").

create table lead_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  source text,
  uploaded_by uuid references profiles(id),
  row_count int not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready')),
  screened_at timestamptz,
  storage_path text,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id),
  batch_id uuid references lead_batches(id),
  phone_e164 text,
  full_name text,
  created_at timestamptz not null default now()
);

create index lead_batches_workspace_idx on lead_batches (workspace_id);
create index leads_workspace_idx on leads (workspace_id);
create index leads_workspace_batch_idx on leads (workspace_id, batch_id);

create table twilio_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  account_sid text,
  auth_token_secret_id uuid,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger twilio_credentials_set_updated_at
  before update on twilio_credentials
  for each row execute function set_updated_at();

-- The one place a raw Twilio auth token is ever handled server-side: wraps
-- vault.create_secret/update_secret so callers (the seed script, and
-- Phase 3's onboarding twilio-connect step) never touch the vault schema
-- directly. service_role only — never callable from an authenticated
-- session, even a manager's.
create or replace function set_twilio_credentials(
  p_workspace_id uuid,
  p_account_sid text,
  p_auth_token text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name = 'twilio_auth_token_' || p_workspace_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_auth_token, 'twilio_auth_token_' || p_workspace_id);
  else
    perform vault.update_secret(v_secret_id, p_auth_token);
  end if;

  insert into twilio_credentials (workspace_id, account_sid, auth_token_secret_id, status)
  values (p_workspace_id, p_account_sid, v_secret_id, 'not_connected')
  on conflict (workspace_id) do update
    set account_sid = excluded.account_sid,
        auth_token_secret_id = excluded.auth_token_secret_id,
        updated_at = now();
end;
$$;

revoke execute on function set_twilio_credentials(uuid, text, text) from public, anon, authenticated;
grant execute on function set_twilio_credentials(uuid, text, text) to service_role;
