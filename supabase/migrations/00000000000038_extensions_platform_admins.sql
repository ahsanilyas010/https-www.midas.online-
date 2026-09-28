-- Phase 1 — multi-tenant foundation, migration 1 of 9.
--
-- The 37 migrations before this one (now under
-- supabase/migrations_legacy_reference/, outside this directory so the CLI
-- never applies them) built a single-tenant schema for a different product.
-- This generation starts fresh: every table from here on carries
-- workspace_id, and isolation is enforced by RLS (migration 044), never by
-- the UI.

create extension if not exists pgcrypto with schema extensions;

create type app_role as enum
  ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst', 'client');

create type workspace_plan as enum ('free', 'paid');
create type workspace_status as enum ('onboarding', 'active', 'suspended', 'canceled');

-- platform_admins is deliberately outside any workspace — the vendor
-- (Assorted)'s own staff, who see workspace metadata and seat usage across
-- every tenant but never a tenant's leads, recordings or credentials (see
-- migration 044's policy set, which simply never grants this role a branch
-- on those tables).
create table platform_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where id = auth.uid())
$$;
revoke execute on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

alter table platform_admins enable row level security;

-- Select-only: there is no insert/update/delete policy for any role,
-- including platform_admins themselves. Membership is granted exclusively
-- by the seed script or a service-role operation — no path in the app can
-- ever let a user add themselves or anyone else to this table.
create policy platform_admins_select on platform_admins for select using (
  is_platform_admin()
);

grant select on platform_admins to authenticated;

-- ---------------------------------------------------------------------
-- Rate limiting on public/unauthenticated mutation endpoints (signup,
-- login, the public lead-inbound form, unsubscribe). Ported forward from
-- legacy migration 00000000000024_hardening.sql — src/lib/rate-limit.ts's
-- checkRateLimit() calls this RPC and is being kept as-is in Phase 1, so
-- the function needs to exist in the new schema too.
create table rate_limit_hits (
  bucket text not null,
  identifier text not null,
  window_start timestamptz not null,
  hit_count int not null default 1,
  primary key (bucket, identifier, window_start)
);

create or replace function check_rate_limit(
  p_bucket text,
  p_identifier text,
  p_max_hits int,
  p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_hits (bucket, identifier, window_start, hit_count)
  values (p_bucket, p_identifier, v_window_start, 1)
  on conflict (bucket, identifier, window_start)
    do update set hit_count = rate_limit_hits.hit_count + 1
  returning hit_count into v_count;

  return v_count <= p_max_hits;
end;
$$;

revoke all on function check_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function check_rate_limit(text, text, int, int) to anon, authenticated;

create or replace function sweep_rate_limit_hits() returns void
language sql security definer set search_path = public as $$
  delete from rate_limit_hits where window_start < now() - interval '1 hour';
$$;
revoke execute on function sweep_rate_limit_hits() from public, anon, authenticated;

-- pg_cron scheduling is left out of Phase 1 deliberately (it needs the
-- pg_cron extension enabled on the project, a Phase-3-adjacent operational
-- concern). Old rows are cheap; sweep manually or wire up cron later.

alter table rate_limit_hits enable row level security;
-- No policies granted at all — every access goes through check_rate_limit(),
-- a SECURITY DEFINER function. There is no direct table access for any
-- role, anon included.
