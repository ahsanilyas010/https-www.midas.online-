-- Zoom Server-to-Server OAuth credentials, one row per workspace. The client
-- secret never lives in this table: client_secret_id points at a Supabase
-- Vault secret written/read only through the service-role-only functions
-- below (mirrors the old Twilio credential pattern).

create table zoom_credentials (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  account_id text not null,
  client_id text not null,
  client_secret_id uuid,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger zoom_credentials_set_updated_at
  before update on zoom_credentials
  for each row execute function set_updated_at();

create trigger zoom_credentials_audit
  after insert or update or delete on zoom_credentials
  for each row execute function audit_row_change('zoom_credentials');

alter table zoom_credentials enable row level security;
create policy zoom_credentials_select on zoom_credentials for select using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- Managers may read status fields only: column-level grant leaves
-- client_secret_id (and anything else) unreadable to the authenticated role.
revoke all on zoom_credentials from anon, authenticated;
grant select (workspace_id, account_id, client_id, status, verified_at, last_error, created_at, updated_at)
  on zoom_credentials to authenticated;

create or replace function set_zoom_credentials(
  p_workspace_id uuid,
  p_account_id text,
  p_client_id text,
  p_client_secret text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name = 'zoom_client_secret_' || p_workspace_id;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_client_secret, 'zoom_client_secret_' || p_workspace_id);
  else
    perform vault.update_secret(v_secret_id, p_client_secret);
  end if;

  insert into zoom_credentials (workspace_id, account_id, client_id, client_secret_id, status, verified_at, last_error)
  values (p_workspace_id, p_account_id, p_client_id, v_secret_id, 'disconnected', null, null)
  on conflict (workspace_id) do update
    set account_id = excluded.account_id,
        client_id = excluded.client_id,
        client_secret_id = excluded.client_secret_id,
        status = 'disconnected',
        verified_at = null,
        last_error = null;
end;
$$;

create or replace function get_zoom_client_secret(p_workspace_id uuid) returns text
language sql security definer set search_path = public as $$
  select ds.decrypted_secret
  from zoom_credentials zc
  join vault.decrypted_secrets ds on ds.id = zc.client_secret_id
  where zc.workspace_id = p_workspace_id
$$;

create or replace function clear_zoom_credentials(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from zoom_credentials where workspace_id = p_workspace_id;
  delete from vault.secrets where name = 'zoom_client_secret_' || p_workspace_id;
end;
$$;

revoke execute on function set_zoom_credentials(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function get_zoom_client_secret(uuid) from public, anon, authenticated;
revoke execute on function clear_zoom_credentials(uuid) from public, anon, authenticated;
grant execute on function set_zoom_credentials(uuid, text, text, text) to service_role;
grant execute on function get_zoom_client_secret(uuid) to service_role;
grant execute on function clear_zoom_credentials(uuid) to service_role;
