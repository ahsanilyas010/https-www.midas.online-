-- Phase 6 follow-up — client stakeholders asked for the disposition
-- ("what response did the agent get") breakdown behind the funnel
-- numbers, not just the funnel itself. Same access-control shape as
-- get_client_funnel (migration 27): call_attempts/dispositions have no
-- client_viewer RLS branch at all, so this SECURITY DEFINER function is
-- the only path in, and it self-scopes a client_viewer to their own
-- client_id regardless of what's passed. Still counts, never notes —
-- call_attempts.notes is free text an agent wrote and is never exposed
-- here.

create type client_disposition_row as (
  campaign_id uuid,
  campaign_name text,
  campaign_code text,
  disposition_code text,
  disposition_label text,
  category text,
  attempts bigint
);

create or replace function get_client_dispositions(p_client_id uuid default null)
returns setof client_disposition_row
language plpgsql security definer set search_path = public as $$
declare
  v_client_id uuid;
begin
  if auth_role() = 'client_viewer' then
    select client_id into v_client_id from profiles where id = auth.uid();
    if v_client_id is null then
      return;
    end if;
  elsif is_manager() then
    v_client_id := p_client_id;
  else
    raise exception 'not authorized';
  end if;

  return query
    select
      c.id,
      c.name,
      c.code,
      d.code,
      d.label,
      d.category,
      count(ca.id) as attempts
    from campaigns c
    join call_attempts ca on ca.campaign_id = c.id
    join dispositions d on d.id = ca.disposition_id
    where (v_client_id is null or c.client_id = v_client_id)
    group by c.id, c.name, c.code, d.code, d.label, d.category, d.sort_order
    order by c.name, d.sort_order;
end;
$$;

revoke execute on function get_client_dispositions(uuid) from public, anon;
grant execute on function get_client_dispositions(uuid) to authenticated;
