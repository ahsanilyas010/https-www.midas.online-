-- Slice C: suppression console. suppression_list is keyed by phone hash
-- only, so a manually added entry gets a masked hint and an optional note
-- for the admin UI. Removing an entry is a deliberate, manager-only,
-- audited operation (the audit trigger from migration 062 records the
-- delete with the removing user).

alter table suppression_list
  add column if not exists phone_hint text,
  add column if not exists note text;

create policy suppression_list_delete_manager on suppression_list for delete using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

grant delete on suppression_list to authenticated;
