-- Phase 7, migration 3 of 5 — client portal read model. A client role has
-- no RLS visibility into `profiles` at all (migration 044) — by design,
-- since the point is a strictly read-only, aggregated view of their own
-- campaigns' performance. These SECURITY DEFINER functions are the one
-- deliberate, narrow exception: they aggregate across profiles/calls but
-- only ever return rows scoped to the caller's own client_id
-- (my_client_id()), and never a phone number (spec: "Never return a phone
-- number to a client-role ... request").

create or replace function client_campaign_funnel() returns table (
  campaign_id uuid,
  campaign_name text,
  loaded bigint,
  screened bigint,
  dialled bigint,
  connected bigint,
  converted bigint
)
language sql stable security definer set search_path = public as $$
  select f.campaign_id, f.campaign_name, f.loaded, f.screened, f.dialled, f.connected, f.converted
  from v_campaign_funnel f
  join campaigns c on c.id = f.campaign_id
  where c.workspace_id = auth_workspace_id()
    and auth_role() = 'client'
    and c.client_id = my_client_id()
$$;

create or replace function client_disposition_breakdown() returns table (
  disposition_label text,
  outcome_group text,
  count bigint
)
language sql stable security definer set search_path = public as $$
  select d.label, d.outcome_group, count(*)
  from calls c
  join campaigns camp on camp.id = c.campaign_id
  join dispositions d on d.id = c.disposition_id
  where c.workspace_id = auth_workspace_id()
    and auth_role() = 'client'
    and camp.client_id = my_client_id()
  group by d.label, d.outcome_group
  order by count(*) desc
$$;

-- p_anonymize: when true, agent names are replaced with a stable
-- "Agent A"/"Agent B"/... label (ordered by first activity) instead of
-- their real name — the anonymise toggle is a viewer preference, decided
-- per request, not stored.
create or replace function client_agent_activity(p_anonymize boolean default false) returns table (
  agent_label text,
  calls bigint,
  connects bigint,
  conversions bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() != 'client' then
    raise exception 'only a client-role user can call this';
  end if;

  return query
  with activity as (
    select
      c.agent_id,
      min(c.created_at) as first_seen,
      count(*) as calls,
      count(*) filter (where d.outcome_group in ('connect', 'conversion')) as connects,
      count(*) filter (where d.outcome_group = 'conversion') as conversions
    from calls c
    join campaigns camp on camp.id = c.campaign_id
    left join dispositions d on d.id = c.disposition_id
    where c.workspace_id = auth_workspace_id() and camp.client_id = my_client_id()
    group by c.agent_id
  ),
  labeled as (
    select
      a.*,
      row_number() over (order by a.first_seen) as rn,
      p.full_name
    from activity a
    join profiles p on p.id = a.agent_id
  )
  select
    case when p_anonymize then 'Agent ' || chr(64 + rn::int) else full_name end,
    calls, connects, conversions
  from labeled
  order by rn;
end;
$$;

revoke execute on function client_campaign_funnel() from public, anon;
revoke execute on function client_disposition_breakdown() from public, anon;
revoke execute on function client_agent_activity(boolean) from public, anon;
grant execute on function client_campaign_funnel() to authenticated;
grant execute on function client_disposition_breakdown() to authenticated;
grant execute on function client_agent_activity(boolean) to authenticated;
