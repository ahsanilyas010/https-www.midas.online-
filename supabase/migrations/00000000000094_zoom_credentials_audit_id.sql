-- audit_row_change() records new.id; zoom_credentials is keyed by
-- workspace_id, so give it a (non-key) id column for the audit trigger.
alter table zoom_credentials add column id uuid not null default gen_random_uuid();
create unique index zoom_credentials_id_key on zoom_credentials (id);
grant select (id) on zoom_credentials to authenticated;
