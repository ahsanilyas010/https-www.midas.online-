-- Simple sign-up: a new workspace is usable immediately. The 4-step setup
-- wizard is gone (setup now happens on the dashboard), so there is no
-- 'onboarding' status to wait out.

-- The guard trigger from migration 44/66 refused status/plan/billing changes
-- from everyone except a platform admin, even though its message (and every
-- caller) assumed the service role could do it. That is what made the old
-- wizard's "Finish setup" fail. Let the service role through (a customer's own
-- session still cannot).
create or replace function guard_workspace_self_update() returns trigger
language plpgsql as $$
begin
  if is_platform_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.seat_limit is distinct from old.seat_limit
     or new.status is distinct from old.status
     or new.is_demo is distinct from old.is_demo
     or new.billing_status is distinct from old.billing_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  then
    raise exception 'plan, seats, status and billing fields can only be changed by the service role or a platform admin';
  end if;
  return new;
end;
$$;

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
  insert into workspaces (slug, name, plan, seat_limit, status, onboarding_step, signup, created_by)
  values (p_slug, p_workspace_name, 'free', 3, 'active', 'done', p_signup, p_user_id)
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

-- One-off: workspaces stuck mid-wizard become active (canceled ones are left
-- alone because they are not 'onboarding').
alter table workspaces disable trigger workspaces_guard_self_update;
update workspaces set status = 'active', onboarding_step = 'done' where status = 'onboarding';
alter table workspaces enable trigger workspaces_guard_self_update;
