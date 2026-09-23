-- Phase 8 — hardening.

-- 1. Compliance evidence bucket, for ManualEvidenceProvider (section 4.4)
-- and any other retained compliance artefact. Private — read/write only
-- via the service-role client from a manager/qa-gated server action, same
-- pattern as user provisioning in src/lib/supabase/admin.ts. No public or
-- authenticated-role storage policy is granted; the admin client bypasses
-- RLS entirely and every check happens in the calling server action.
insert into storage.buckets (id, name, public)
values ('compliance-evidence', 'compliance-evidence', false)
on conflict (id) do nothing;

-- 2. Screening currency was silently invisible: v_dialable_leads already
-- excludes leads whose screened_at is older than the campaign's
-- screening_max_age_days (so the compliance gate itself was never
-- unsafe), but nothing ever flipped leads.screening_status to 'expired'
-- — the compliance console's "Expired" counter has been reading a column
-- no code path ever sets. Sweep it the same way sweep_followups() does.
create or replace function sweep_screening_expiry() returns void
language sql security definer set search_path = public as $$
  update leads l
  set screening_status = 'expired'
  from campaigns c
  where l.campaign_id = c.id
    and l.screening_status = 'passed'
    and l.screened_at is not null
    and l.screened_at < now() - (c.screening_max_age_days || ' days')::interval;
$$;
revoke execute on function sweep_screening_expiry() from public, anon, authenticated;

select cron.schedule('sweep-screening-expiry', '17 * * * *', 'select sweep_screening_expiry();');

-- 3. Rate limiting on public/unauthenticated mutation endpoints (section
-- 7, Phase 8: "Rate limiting on all mutation endpoints"). A fixed-window
-- counter keyed by (bucket, identifier) — simple, and correct across
-- however many serverless instances are running since the state lives in
-- Postgres, not per-process memory.
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

-- Old windows are cheap to accumulate and cheap to sweep; keep an hour.
create or replace function sweep_rate_limit_hits() returns void
language sql security definer set search_path = public as $$
  delete from rate_limit_hits where window_start < now() - interval '1 hour';
$$;
revoke execute on function sweep_rate_limit_hits() from public, anon, authenticated;

select cron.schedule('sweep-rate-limit-hits', '*/30 * * * *', 'select sweep_rate_limit_hits();');

alter table rate_limit_hits enable row level security;
-- No policies granted at all: every access to this table goes through
-- check_rate_limit(), a SECURITY DEFINER function — there is no direct
-- table access for any role, anon included.
