-- Phase 3, migration 3 of 6 — API Key storage. The browser softphone's
-- AccessToken (src/app/api/twilio/[workspaceId]/token) is minted from an
-- API Key/Secret pair, not the Account SID/Auth Token — per spec's
-- CREDENTIAL MODEL: "Account SID, Auth Token, API Key, API Secret, TwiML
-- App SID, owned numbers." Auto-provisioned by
-- src/lib/twilio/verify.ts on first successful verification (via the
-- Twilio REST API) rather than asking the admin to create one by hand in
-- the console — one less manual step for a new workspace to get dialing.

alter table twilio_credentials
  add column api_key_sid text,
  add column api_key_secret_id uuid;

create or replace function set_twilio_api_key(
  p_workspace_id uuid,
  p_api_key_sid text,
  p_api_key_secret text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name = 'twilio_api_key_secret_' || p_workspace_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_api_key_secret, 'twilio_api_key_secret_' || p_workspace_id);
  else
    perform vault.update_secret(v_secret_id, p_api_key_secret);
  end if;

  update twilio_credentials
  set api_key_sid = p_api_key_sid, api_key_secret_id = v_secret_id
  where workspace_id = p_workspace_id;
end;
$$;

revoke execute on function set_twilio_api_key(uuid, text, text) from public, anon, authenticated;
grant execute on function set_twilio_api_key(uuid, text, text) to service_role;

create or replace function get_twilio_api_key_secret(p_workspace_id uuid) returns text
language sql security definer set search_path = public as $$
  select vault.decrypted_secrets.decrypted_secret
  from twilio_credentials
  join vault.decrypted_secrets on vault.decrypted_secrets.id = twilio_credentials.api_key_secret_id
  where twilio_credentials.workspace_id = p_workspace_id
$$;

revoke execute on function get_twilio_api_key_secret(uuid) from public, anon, authenticated;
grant execute on function get_twilio_api_key_secret(uuid) to service_role;
