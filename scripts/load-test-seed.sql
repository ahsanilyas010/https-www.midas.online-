-- Phase 8 load-test seed. See docs/load-testing.md before running this —
-- it generates ~500k leads and ~2M call attempts, which is very plausibly
-- enough on its own to fill a Supabase free-tier project's 500 MB. Run
-- this against a disposable Supabase branch or throwaway project, never
-- directly against a project holding real data, on a tier with no
-- backups.
--
-- Usage: psql "$DATABASE_URL" -f scripts/load-test-seed.sql
--
-- Requires: at least one campaign and one active agent profile already
-- exist (bootstrap one with npm run bootstrap-admin first if this is a
-- fresh throwaway project, then create a campaign through the app).

do $$
declare
  v_campaign_id uuid;
  v_agent_ids uuid[];
  v_disposition_id uuid;
  v_existing_leads bigint;
begin
  select id into v_campaign_id from campaigns order by created_at limit 1;
  if v_campaign_id is null then
    raise exception 'No campaign found — create one through the app first.';
  end if;

  select array_agg(id) into v_agent_ids from profiles where role = 'agent' and is_active limit 50;
  if v_agent_ids is null or array_length(v_agent_ids, 1) = 0 then
    raise exception 'No active agent profiles found — bootstrap at least one agent first.';
  end if;

  select id into v_disposition_id from dispositions where category = 'connected_positive' limit 1;

  select count(*) into v_existing_leads from leads where campaign_id = v_campaign_id;
  if v_existing_leads >= 500000 then
    raise notice 'Campaign % already has % leads — skipping lead generation.', v_campaign_id, v_existing_leads;
  else
    raise notice 'Generating 500,000 synthetic leads on campaign %...', v_campaign_id;

    insert into leads (
      campaign_id, first_name, last_name, phone_e164, phone_raw, country_code,
      status, screening_status, screened_at, attempt_count, created_at
    )
    select
      v_campaign_id,
      'LoadTest',
      'Lead' || g,
      '+447' || lpad((700000000 + g)::text, 9, '0'),
      '+447' || lpad((700000000 + g)::text, 9, '0'),
      'GB',
      (array['new','ready','assigned','contacted','qualified'])[1 + (g % 5)]::lead_status,
      'passed'::screening_status,
      now() - (g % 20 || ' days')::interval,
      g % 4,
      now() - (g % 365 || ' days')::interval
    from generate_series(1, 500000) as g;
  end if;

  raise notice 'Generating 2,000,000 synthetic call attempts...';

  insert into call_attempts (
    lead_id, campaign_id, agent_id, attempt_no, disposition_id,
    started_at, ended_at, talk_seconds, wrap_seconds, lead_local_time, within_call_window
  )
  select
    l.id,
    v_campaign_id,
    v_agent_ids[1 + (row_number() over () % array_length(v_agent_ids, 1))],
    1 + (row_number() over () % 4),
    v_disposition_id,
    l.created_at + (random() * interval '30 days'),
    l.created_at + (random() * interval '30 days') + (random() * interval '5 minutes'),
    (random() * 300)::int,
    (random() * 60)::int,
    l.created_at + (random() * interval '30 days'),
    true
  from leads l
  where l.campaign_id = v_campaign_id
  cross join lateral generate_series(1, 4) as attempt_multiplier
  limit 2000000;

  raise notice 'Done. Run the EXPLAIN ANALYZE queries in docs/load-testing.md next.';
end $$;
