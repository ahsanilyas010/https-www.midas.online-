-- RLS for the Phase 2 tables, plus the audit triggers section 4.11 calls
-- for leads and suppression_list, plus the compliance-field guard on leads
-- that mirrors the one already in place on profiles.

alter table data_sources enable row level security;
alter table lead_batches enable row level security;
alter table leads enable row level security;
alter table suppression_list enable row level security;
alter table suppression_runs enable row level security;
alter table dispositions enable row level security;
alter table call_attempts enable row level security;

-- data_sources / lead_batches / suppression_runs: manager-only. Agents
-- don't interact with import machinery directly.
create policy data_sources_all on data_sources for all
  using (is_manager()) with check (is_manager());
create policy lead_batches_all on lead_batches for all
  using (is_manager()) with check (is_manager());
create policy suppression_runs_all on suppression_runs for all
  using (is_manager()) with check (is_manager());

-- Dispositions: everyone signed in can read (the dial screen needs the
-- list); only managers configure them.
create policy dispositions_select on dispositions for select
  using (auth.uid() is not null);
create policy dispositions_write on dispositions for all
  using (is_manager()) with check (is_manager());

-- Leads: section 5's leads_select/leads_update_agent, extended with
-- managers getting full write and qa/team_lead read scoping.
create policy leads_select on leads for select using (
  is_manager()
  or (auth_role() = 'team_lead' and assigned_to in (select my_team_members()))
  or (auth_role() = 'agent' and assigned_to = auth.uid()
      and exists (select 1 from campaign_assignments ca
                  where ca.campaign_id = leads.campaign_id
                    and ca.user_id = auth.uid()))
  or auth_role() = 'qa'
);

create policy leads_write_manager on leads for all
  using (is_manager()) with check (is_manager());

create policy leads_update_agent on leads for update using (
  auth_role() = 'agent' and assigned_to = auth.uid()
) with check (
  auth_role() = 'agent' and assigned_to = auth.uid()
);

-- Column restriction: an agent may update working fields (status, notes via
-- `custom`, attempt bookkeeping) but never the compliance fields. Enforced
-- with a BEFORE UPDATE trigger, since RLS alone can't restrict columns.
create or replace function guard_lead_agent_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth_role() = 'agent' and auth.uid() = old.assigned_to then
    if new.screening_status is distinct from old.screening_status
       or new.screened_at is distinct from old.screened_at
       or new.screening_run_id is distinct from old.screening_run_id
       or new.data_source_id is distinct from old.data_source_id
       or new.batch_id is distinct from old.batch_id
       or new.campaign_id is distinct from old.campaign_id
       or new.consent_status is distinct from old.consent_status
       or new.consent_source is distinct from old.consent_source
       or new.consent_captured_at is distinct from old.consent_captured_at
       or new.consent_evidence_path is distinct from old.consent_evidence_path
       or new.retention_expires_at is distinct from old.retention_expires_at
       or new.phone_e164 is distinct from old.phone_e164
    then
      raise exception 'agents cannot change compliance, provenance or identity fields on a lead';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_guard_agent_update
  before update on leads
  for each row execute function guard_lead_agent_update();

-- Suppression list: anyone signed in can INSERT — an opt-out must never be
-- blocked. Only super_admin can DELETE, and there is deliberately no
-- UPDATE policy: a suppression entry is corrected by superseding it, not
-- editing it in place.
create policy suppression_select on suppression_list for select
  using (is_manager() or auth_role() = 'qa');
create policy suppression_insert on suppression_list for insert
  with check (auth.uid() is not null);
create policy suppression_delete on suppression_list for delete
  using (auth_role() = 'super_admin');

-- call_attempts: the log is written before the agent dials and updated by
-- the same agent through wrap-up. Never editable by anyone else, never
-- deletable by anyone.
create policy call_attempts_select on call_attempts for select using (
  is_manager()
  or auth_role() = 'qa'
  or agent_id = auth.uid()
  or (auth_role() = 'team_lead' and agent_id in (select my_team_members()))
);
create policy call_attempts_insert on call_attempts for insert with check (
  agent_id = auth.uid() or is_manager()
);
create policy call_attempts_update on call_attempts for update using (
  agent_id = auth.uid() or is_manager()
);

grant select, insert, update, delete on
  data_sources, lead_batches, leads, suppression_runs, dispositions, call_attempts
  to authenticated;
grant select, insert on suppression_list to authenticated;
grant delete on suppression_list to authenticated; -- gated to super_admin by RLS
grant select on v_dialable_leads to authenticated;

create trigger leads_audit
  after insert or update or delete on leads
  for each row execute function audit_row_change('lead');

-- suppression_list's primary key is phone_e164 (text), not a uuid `id`
-- column, so it can't use audit_row_change() as-is — audit_log.entity_id
-- stays null here and the phone number lives in before/after_data instead.
create or replace function audit_suppression_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (actor_id, action, entity_type, after_data)
    values (auth.uid(), 'insert', 'suppression_list', to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_log (actor_id, action, entity_type, before_data)
    values (auth.uid(), 'delete', 'suppression_list', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

create trigger suppression_list_audit
  after insert or delete on suppression_list
  for each row execute function audit_suppression_change();

revoke execute on function audit_suppression_change() from public, anon, authenticated;
