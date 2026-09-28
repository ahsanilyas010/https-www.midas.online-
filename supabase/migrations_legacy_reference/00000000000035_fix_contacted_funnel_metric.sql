-- Both funnel metrics (admin's v_campaign_funnel and the client-facing
-- get_client_funnel) defined "contacted" as
-- `status in ('contacted', 'qualified', 'converted')`. But
-- record_call_attempt() (migration 13) never actually sets a lead's
-- status to 'contacted' — its CASE only ever produces 'suppressed',
-- 'qualified', 'callback', 'unreachable', 'rejected', or (for every other
-- disposition, including plain "connected — not interested"/"hang up"
-- outcomes) 'in_progress'. So the "contacted" bucket only ever counted
-- leads that happened to reach 'qualified'/'converted' directly, showing
-- 0 (or near-0) even on campaigns agents were actively working.
--
-- The business definition here is simpler than the lead's terminal
-- status: once an agent logs any call attempt against a lead, that lead
-- is "contacted" — this is exactly what attempt_count > 0 already means
-- (see v_campaign_funnel's pre-existing `worked` column, same idea).
-- Using attempt_count keeps the funnel monotonic (qualified/converted
-- leads always have attempt_count > 0, so contacted still bounds them
-- from below) without touching record_call_attempt's status/dialable
-- logic — leads that said "not interested" or "hang up" must stay
-- 'rejected' so v_dialable_leads keeps excluding them from re-dial.

create or replace view v_campaign_funnel
with (security_invoker = true) as
select
  campaign_id,
  count(*) as loaded,
  count(*) filter (where screening_status = 'passed') as screened_passed,
  count(*) filter (where screening_status = 'passed' and not do_not_call
                    and status not in ('converted', 'rejected', 'suppressed', 'unreachable')) as dialable,
  count(*) filter (where attempt_count > 0) as worked,
  count(*) filter (where attempt_count > 0) as contacted,
  count(*) filter (where status = 'qualified') as qualified,
  count(*) filter (where status = 'converted') as converted
from leads
group by campaign_id;

create or replace function get_client_funnel(p_client_id uuid default null)
returns setof client_funnel_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null then
      return; -- account has no client linked yet: nothing to show, not an error
    end if;
  elsif is_manager() then
    v_client_id := p_client_id; -- null = every client
  else
    raise exception 'not authorized';
  end if;

  return query
    select
      c.id,
      c.name,
      c.code,
      c.market,
      count(l.id) as loaded,
      count(l.id) filter (
        where l.screening_status = 'passed' and not l.do_not_call
          and l.status not in ('converted', 'rejected', 'suppressed', 'unreachable')
      ) as dialable,
      count(l.id) filter (where l.attempt_count > 0) as contacted,
      count(l.id) filter (where l.status in ('qualified', 'converted')) as qualified,
      count(l.id) filter (where l.status = 'converted') as converted
    from campaigns c
    left join leads l on l.campaign_id = c.id
    where (v_client_id is null or c.client_id = v_client_id)
    group by c.id, c.name, c.code, c.market
    order by c.name;
end;
$$;
