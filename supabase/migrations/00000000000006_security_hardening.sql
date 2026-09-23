-- Follow-up hardening after the initial advisor pass:
--   1. Pin search_path on the two functions that were missing it.
--   2. Audit log inserts must come from the trigger only (which runs as the
--      table owner and bypasses RLS by ownership) — not from a client hitting
--      PostgREST directly with a fabricated row. Drop the direct insert path.
--   3. RLS helper functions and the audit trigger function don't need to be
--      callable by `anon` or via RPC at all; restrict execution.

create or replace function set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function guard_profile_self_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_manager() and auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.agent_code is distinct from old.agent_code
       or new.team_id is distinct from old.team_id
       or new.client_id is distinct from old.client_id
       or new.allow_login_outside_shift is distinct from old.allow_login_outside_shift
       or new.must_change_password is distinct from old.must_change_password
    then
      raise exception 'agents cannot change role, team, client, activation or credential-lifecycle fields on their own profile';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists audit_log_insert on audit_log;
revoke insert on audit_log from authenticated, anon;

revoke execute on function audit_row_change() from public, anon, authenticated;
revoke execute on function auth_role() from public, anon;
revoke execute on function is_manager() from public, anon;
revoke execute on function my_team_members() from public, anon;
grant execute on function auth_role() to authenticated;
grant execute on function is_manager() to authenticated;
grant execute on function my_team_members() to authenticated;
