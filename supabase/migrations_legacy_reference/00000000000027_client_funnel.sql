-- Phase 6 — client-facing aggregate-only reporting (spec section 6.6).
--
-- leads_select (migration 11) deliberately has no client_viewer branch —
-- a client stakeholder gets zero row-level access to the leads table, so
-- there is no way to leak a name/phone/email to them even if the UI has
-- a bug. The only path in is this SECURITY DEFINER function: it returns
-- per-campaign counts only, and self-scopes a client_viewer to their own
-- client_id regardless of what's passed in, so the parameter is only
-- ever meaningful for managers previewing a specific client's view.

create type client_funnel_row as (
  campaign_id uuid,
  campaign_name text,
  campaign_code text,
  market text,
  loaded bigint,
  dialable bigint,
  contacted bigint,
  qualified bigint,
  converted bigint
);

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
      -- Cumulative buckets — a lead's current status is the only stage
      -- we have (no state-transition history table), so "reached
      -- qualified" is approximated as "currently qualified or further
      -- along (converted)", same idea already used by v_campaign_funnel.
      count(l.id) filter (where l.status in ('contacted', 'qualified', 'converted')) as contacted,
      count(l.id) filter (where l.status in ('qualified', 'converted')) as qualified,
      count(l.id) filter (where l.status = 'converted') as converted
    from campaigns c
    left join leads l on l.campaign_id = c.id
    where (v_client_id is null or c.client_id = v_client_id)
    group by c.id, c.name, c.code, c.market
    order by c.name;
end;
$$;

revoke execute on function get_client_funnel(uuid) from public, anon;
grant execute on function get_client_funnel(uuid) to authenticated;
