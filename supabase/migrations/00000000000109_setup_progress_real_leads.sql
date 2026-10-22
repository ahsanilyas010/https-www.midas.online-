-- setup_progress(): 'leads' and 'leads_passed' now count REAL leads only: the
-- ones Data can account for (imported from a data source, added by hand, or
-- received by the webhook: any lead with a source label or a data source).
-- Sample data from the demo seed (no source, no data source, batch
-- 'demo seed') no longer ticks "Add leads" or "Screen your leads".
-- Same shape as migration 100, so callers do not change.
create or replace function setup_progress() returns table (
  branded boolean,
  zoom_connected boolean,
  agents int,
  campaigns int,
  leads int,
  leads_passed int,
  assignments int,
  calls int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ws uuid := auth_workspace_id();
begin
  if v_ws is null or not is_workspace_manager() then
    raise exception 'only a workspace manager can read setup progress';
  end if;

  return query
  select
    exists (select 1 from workspaces w where w.id = v_ws
            and (w.brand_logo_url is not null or w.brand_primary_color is not null or w.brand_product_name is not null)),
    exists (select 1 from zoom_credentials z where z.workspace_id = v_ws and z.status = 'connected'),
    (select count(*)::int from (select 1 from profiles p where p.workspace_id = v_ws and p.role = 'agent' and p.is_active limit 1000) a),
    (select count(*)::int from (select 1 from campaigns c where c.workspace_id = v_ws limit 1000) a),
    (select count(*)::int from (select 1 from leads l where l.workspace_id = v_ws
       and (l.data_source_id is not null or l.source is not null) limit 1000) a),
    (select count(*)::int from (select 1 from leads l where l.workspace_id = v_ws
       and (l.data_source_id is not null or l.source is not null)
       and l.screening_status = 'passed' limit 1000) a),
    (select count(*)::int from (select 1 from campaign_assignments ca join profiles pa on pa.id = ca.user_id
       where ca.workspace_id = v_ws and pa.role in ('agent', 'team_lead') limit 1000) a),
    (select count(*)::int from (select 1 from calls c where c.workspace_id = v_ws limit 1000) a);
end;
$$;

revoke execute on function setup_progress() from public, anon;
grant execute on function setup_progress() to authenticated;
