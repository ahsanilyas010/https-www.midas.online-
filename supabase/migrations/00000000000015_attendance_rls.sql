-- RLS for Phase 4. Learned from migration 00000000000012: never inline a
-- subquery on a table within that same table's own policy — always route
-- team-scoping through my_team_members()/my_team_id(), which are
-- SECURITY DEFINER and therefore bypass RLS recursion.

alter table shifts enable row level security;
alter table shift_assignments enable row level security;
alter table attendance_sessions enable row level security;
alter table aux_logs enable row level security;
alter table leave_requests enable row level security;
alter table holidays enable row level security;

create policy shifts_select on shifts for select using (auth.uid() is not null);
create policy shifts_write on shifts for all using (is_manager()) with check (is_manager());

create policy holidays_select on holidays for select using (auth.uid() is not null);
create policy holidays_write on holidays for all using (is_manager()) with check (is_manager());

create policy shift_assignments_select on shift_assignments for select using (
  is_manager()
  or user_id = auth.uid()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy shift_assignments_write on shift_assignments for all
  using (is_manager()) with check (is_manager());

-- Agents cannot edit their own attendance — corrections are manager/
-- team-lead-authored is_manual_entry rows. Clock-in/out and aux-state
-- changes go through SECURITY DEFINER RPCs (next migration) that bypass
-- this for the narrow, audited actions they perform.
create policy attendance_select on attendance_sessions for select using (
  user_id = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy attendance_no_self_edit on attendance_sessions for update using (
  is_manager() or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy attendance_manager_insert on attendance_sessions for insert
  with check (is_manager() or auth_role() = 'team_lead');

create policy aux_logs_select on aux_logs for select using (
  user_id = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);

create policy leave_requests_select on leave_requests for select using (
  user_id = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);
create policy leave_requests_insert on leave_requests for insert
  with check (user_id = auth.uid());
create policy leave_requests_decide on leave_requests for update using (
  is_manager() or (auth_role() = 'team_lead' and user_id in (select my_team_members()))
);

grant select, insert, update, delete on shifts, shift_assignments, holidays to authenticated;
grant select, insert, update on attendance_sessions to authenticated;
grant select on aux_logs to authenticated;
grant select, insert, update on leave_requests to authenticated;

create trigger attendance_sessions_audit
  after insert or update or delete on attendance_sessions
  for each row execute function audit_row_change('attendance_session');
