-- Managers' "Client reports": the same read model the client portal gives a
-- client login (migration 64), but for any one of the workspace's clients,
-- callable by super_admin / ops_manager only. Like the client functions it
-- aggregates only — never a phone number or a recording.

create or replace function manager_client_report(p_client_id uuid, p_anonymize boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_funnel jsonb;
  v_outcomes jsonb;
  v_activity jsonb;
begin
  if auth_role() not in ('super_admin', 'ops_manager') then
    raise exception 'only an admin or ops manager can view client reports';
  end if;
  if not exists (select 1 from clients where id = p_client_id and workspace_id = auth_workspace_id()) then
    raise exception 'unknown client';
  end if;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.campaign_name), '[]'::jsonb) into v_funnel
  from (
    select f.campaign_id, f.campaign_name, f.loaded, f.screened, f.dialled, f.connected, f.converted
    from v_campaign_funnel f
    join campaigns c on c.id = f.campaign_id
    where c.workspace_id = auth_workspace_id() and c.client_id = p_client_id
  ) f;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.count desc), '[]'::jsonb) into v_outcomes
  from (
    select d.label as disposition_label, d.outcome_group, count(*) as count
    from calls c
    join campaigns camp on camp.id = c.campaign_id
    join dispositions d on d.id = c.disposition_id
    where c.workspace_id = auth_workspace_id() and camp.client_id = p_client_id
    group by d.label, d.outcome_group
  ) o;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.rn), '[]'::jsonb) into v_activity
  from (
    select
      case when p_anonymize then 'Agent ' || chr(64 + (row_number() over (order by min(c.created_at)))::int) else p.full_name end as agent_label,
      count(*) as calls,
      count(*) filter (where d.outcome_group in ('connect', 'conversion')) as connects,
      count(*) filter (where d.outcome_group = 'conversion') as conversions,
      row_number() over (order by min(c.created_at)) as rn
    from calls c
    join campaigns camp on camp.id = c.campaign_id
    join profiles p on p.id = c.agent_id
    left join dispositions d on d.id = c.disposition_id
    where c.workspace_id = auth_workspace_id() and camp.client_id = p_client_id
    group by p.id, p.full_name
  ) a;

  return jsonb_build_object('funnel', v_funnel, 'outcomes', v_outcomes, 'activity', v_activity);
end;
$$;

revoke execute on function manager_client_report(uuid, boolean) from public, anon;
grant execute on function manager_client_report(uuid, boolean) to authenticated;
