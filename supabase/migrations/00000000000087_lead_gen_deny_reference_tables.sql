-- Lead Gen seat, 4 of 4 - three reference tables had "any signed-in member of
-- the workspace" read policies (dispositions, qa_templates, qa_criteria).
-- Lead gen never dials or scores calls, so they are closed to that role.
-- Every other role's access is unchanged.

drop policy if exists dispositions_select on dispositions;
create policy dispositions_select on dispositions for select using (
  auth.uid() is not null and auth_role() <> 'lead_gen'
);

drop policy if exists qa_templates_select on qa_templates;
create policy qa_templates_select on qa_templates for select using (
  workspace_id = auth_workspace_id() and auth_role() <> 'lead_gen'
);

drop policy if exists qa_criteria_select on qa_criteria;
create policy qa_criteria_select on qa_criteria for select using (
  workspace_id = auth_workspace_id() and auth_role() <> 'lead_gen'
);
