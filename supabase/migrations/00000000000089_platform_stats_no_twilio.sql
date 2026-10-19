-- Twilio is no longer a product feature; drop the twilio_connected column
-- from the platform dashboard function (the return shape changes, so the
-- function itself is recreated; no table data is touched).
drop function if exists platform_workspace_stats();

create function platform_workspace_stats() returns table (
  workspace_id uuid,
  agents_active_today bigint,
  calls_today bigint
)
language sql stable security definer set search_path = public as $$
  select
    w.id,
    (select count(distinct ae.user_id) from attendance_events ae
       where ae.workspace_id = w.id and ae.occurred_at >= date_trunc('day', now()) and ae.event_type = 'clock_in'),
    (select count(*) from calls c where c.workspace_id = w.id and c.created_at >= date_trunc('day', now()))
  from workspaces w
  where is_platform_admin()
$$;

revoke execute on function platform_workspace_stats() from public, anon, authenticated;
grant execute on function platform_workspace_stats() to authenticated;
