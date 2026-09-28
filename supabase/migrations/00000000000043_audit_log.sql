-- Phase 1, migration 6 of 9 — audit_log. Unlike legacy migration
-- 00000000000004_audit_log.sql, this carries workspace_id directly so RLS
-- can scope reads per-tenant rather than globally-to-every-manager.

create table audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users(id),
  workspace_id uuid references workspaces(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_workspace_idx on audit_log (workspace_id, created_at desc);
create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);

create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_workspace uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'DELETE' then
    v_workspace := old.workspace_id;
  else
    v_workspace := new.workspace_id;
  end if;

  if tg_op = 'INSERT' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, after_data)
    values (v_actor, v_workspace, 'insert', tg_argv[0], new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, before_data, after_data)
    values (v_actor, v_workspace, 'update', tg_argv[0], new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, before_data)
    values (v_actor, v_workspace, 'delete', tg_argv[0], old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

-- workspaces itself has no workspace_id column (it IS the tenant), so its
-- trigger passes NEW/OLD.id as the workspace scope explicitly rather than
-- relying on a workspace_id column that doesn't exist on this one table.
create or replace function audit_workspace_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_workspace uuid;
begin
  v_actor := auth.uid();
  v_workspace := coalesce(new.id, old.id);
  if tg_op = 'INSERT' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, after_data)
    values (v_actor, v_workspace, 'insert', 'workspace', new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, before_data, after_data)
    values (v_actor, v_workspace, 'update', 'workspace', new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor_id, workspace_id, action, entity_type, entity_id, before_data)
    values (v_actor, v_workspace, 'delete', 'workspace', old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger workspaces_audit
  after insert or update or delete on workspaces
  for each row execute function audit_workspace_change();

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function audit_row_change('profile');

create trigger teams_audit
  after insert or update or delete on teams
  for each row execute function audit_row_change('team');

create trigger clients_audit
  after insert or update or delete on clients
  for each row execute function audit_row_change('client');

create trigger campaigns_audit
  after insert or update or delete on campaigns
  for each row execute function audit_row_change('campaign');
