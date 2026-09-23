-- Section 4.11 (partial — audit_log + triggers for the tables that exist in
-- Phase 1). Application-level auditing gets forgotten; triggers do not.
-- More triggers get added on leads/suppression_list/attendance_sessions/
-- email_templates when those tables land in their respective phases.

create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on audit_log (entity_type, entity_id, created_at desc);
create index audit_actor_idx on audit_log (actor_id, created_at desc);

create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    insert into audit_log (actor_id, action, entity_type, entity_id, after_data)
    values (v_actor, 'insert', tg_argv[0], new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
    values (v_actor, 'update', tg_argv[0], new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor_id, action, entity_type, entity_id, before_data)
    values (v_actor, 'delete', tg_argv[0], old.id, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function audit_row_change('profile');

create trigger campaigns_audit
  after insert or update or delete on campaigns
  for each row execute function audit_row_change('campaign');

create trigger teams_audit
  after insert or update or delete on teams
  for each row execute function audit_row_change('team');

create trigger clients_audit
  after insert or update or delete on clients
  for each row execute function audit_row_change('client');
