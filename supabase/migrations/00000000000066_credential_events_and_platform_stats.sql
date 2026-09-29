-- Phase 8, migration 1 of 2 — credential events (spec: "Track credential
-- events and active sessions" — active-session tracking itself is
-- Supabase Auth's own admin session list, not duplicated here) and the
-- platform-owner dashboard's per-workspace stats.

create table credential_events (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event text not null check (event in ('created', 'temp_issued', 'reset_by_admin', 'changed_by_user', 'locked', 'unlocked')),
  created_at timestamptz not null default now()
);

create index credential_events_workspace_user_idx on credential_events (workspace_id, user_id, created_at desc);

alter table credential_events enable row level security;
create policy credential_events_select on credential_events for select using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
-- Insert-only via the service role (src/lib/accounts/index.ts) — no
-- authenticated-role insert policy, matching audit_log's append-only
-- pattern.
grant select on credential_events to authenticated;

-- Platform admin dashboard: seats used, agents active today, calls today,
-- Twilio connected — spec explicitly lists these, and none of them are
-- derivable from the plain `workspaces` row platform_admins can already
-- read (migration 044's workspaces_select). Still never touches leads,
-- phone numbers or recordings — every column here is a count.
create or replace function platform_workspace_stats() returns table (
  workspace_id uuid,
  agents_active_today bigint,
  calls_today bigint,
  twilio_connected boolean
)
language sql stable security definer set search_path = public as $$
  select
    w.id,
    (select count(distinct ae.user_id) from attendance_events ae
       where ae.workspace_id = w.id and ae.occurred_at >= date_trunc('day', now()) and ae.event_type = 'clock_in'),
    (select count(*) from calls c where c.workspace_id = w.id and c.created_at >= date_trunc('day', now())),
    coalesce((select tc.status = 'connected' from twilio_credentials tc where tc.workspace_id = w.id), false)
  from workspaces w
  where is_platform_admin()
$$;

revoke execute on function platform_workspace_stats() from public, anon, authenticated;
grant execute on function platform_workspace_stats() to authenticated;

-- Migration 044's guard_workspace_self_update trigger unconditionally
-- blocks changing plan/seat_limit/status/billing fields — it never
-- checked *who* was asking, only *what* changed, because in Phase 1 the
-- only caller that could reach an UPDATE on workspaces at all was a
-- workspace's own manager (via workspaces_update_manager). Now that a
-- platform_admin needs to change status too, the guard has to let that
-- one case through — auth.uid()/is_platform_admin() still reflect the
-- real caller inside a SECURITY DEFINER function's trigger, since
-- request.jwt.claims is session-level, not swapped by SECURITY DEFINER.
create or replace function guard_workspace_self_update() returns trigger
language plpgsql as $$
begin
  if is_platform_admin() then
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

-- Suspend/reactivate — platform_admin only, per the guard above.
create or replace function platform_set_workspace_status(p_workspace_id uuid, p_status workspace_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'only a platform admin can change workspace status';
  end if;
  update workspaces set status = p_status where id = p_workspace_id;
end;
$$;

revoke execute on function platform_set_workspace_status(uuid, workspace_status) from public, anon, authenticated;
grant execute on function platform_set_workspace_status(uuid, workspace_status) to authenticated;
