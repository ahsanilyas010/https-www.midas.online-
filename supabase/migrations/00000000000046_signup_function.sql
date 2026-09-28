-- Phase 1, migration 9 of 9 — the signup function. auth.users (GoTrue) and
-- these domain tables aren't the same transaction boundary, so the app
-- layer (src/lib/actions/signup.ts) creates the auth user first via the
-- admin client, then calls this function — atomic within Postgres — and
-- compensates by deleting the auth user if this call throws.

create or replace function create_workspace_with_owner(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_workspace_name text,
  p_slug text,
  p_phone text default null,
  p_team_size text default null,
  p_signup jsonb default '{}'::jsonb
) returns workspaces
language plpgsql security definer set search_path = public as $$
declare
  v_workspace workspaces;
begin
  insert into workspaces (slug, name, plan, seat_limit, status, signup, created_by)
  values (p_slug, p_workspace_name, 'free', 3, 'onboarding', p_signup, p_user_id)
  returning * into v_workspace;

  insert into profiles (id, workspace_id, email, full_name, role, phone, must_change_password)
  values (p_user_id, v_workspace.id, p_email, p_full_name, 'super_admin', p_phone, false);

  return v_workspace;
end;
$$;

revoke execute on function create_workspace_with_owner(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function create_workspace_with_owner(uuid, text, text, text, text, text, text, jsonb)
  to service_role;

-- Advances the onboarding wizard's step, flipping the workspace to active
-- once the last step ('done') is reached. Granted to authenticated (each
-- wizard step's server action calls it as the signed-in owner), but still
-- asserts the caller manages that exact workspace internally as defense
-- in depth — the app layer checks this too, via requireProfile() +
-- getCurrentWorkspace().
create or replace function mark_onboarding_step(p_workspace_id uuid, p_step text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth_workspace_id() is distinct from p_workspace_id or not is_workspace_manager() then
    raise exception 'not authorized to advance onboarding for this workspace';
  end if;

  update workspaces
  set onboarding_step = p_step,
      status = case when p_step = 'done' then 'active'::workspace_status else status end
  where id = p_workspace_id;
end;
$$;

revoke execute on function mark_onboarding_step(uuid, text) from public, anon;
grant execute on function mark_onboarding_step(uuid, text) to authenticated;
