-- Section 3.1's forced-password-change flow was broken for every
-- non-manager role by guard_profile_self_update() (migration 6): that
-- trigger blocks a self-update from changing `must_change_password` at
-- all, but src/lib/actions/auth.ts's changePassword() needs to flip it
-- true -> false as the last step of legitimately completing that exact
-- flow. Managers never hit this (the guard's condition is
-- `not is_manager()`), which is why the super_admin bootstrap account
-- worked fine and this only surfaced with the first non-manager user.
--
-- Fix: allow the true -> false self-transition specifically (the one
-- direction the app's own change-password flow performs, right after the
-- real Auth password has already been updated in the same request).
-- Every other guarded field, and every other transition of this one,
-- stays blocked exactly as before.
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
       or (new.must_change_password is distinct from old.must_change_password
           and not (old.must_change_password = true and new.must_change_password = false))
    then
      raise exception 'agents cannot change role, team, client, activation or credential-lifecycle fields on their own profile';
    end if;
  end if;
  return new;
end;
$$;
