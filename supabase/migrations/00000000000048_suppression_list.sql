-- Phase 2, migration 2 of 7 — suppression_list. Global across the
-- workspace (spec: "Suppression is global across the workspace"), keyed
-- by phone_hash so the compliance gate can check it without ever needing
-- the raw number outside the leads table itself.

create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  phone_hash text not null,
  reason text not null,
  evidence_url text,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, phone_hash)
);

create index suppression_list_workspace_hash_idx on suppression_list (workspace_id, phone_hash);

alter table suppression_list enable row level security;

-- Staff-only, same role set as leads (migration 044) — a client or
-- platform_admin never sees this table either.
create policy suppression_list_select on suppression_list for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);
create policy suppression_list_insert on suppression_list for insert with check (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);
-- No update/delete policy: suppression is add-only from the app's
-- perspective (removing someone from a DNC list is a deliberate,
-- audited, manager-only operation that doesn't exist yet in Phase 2 —
-- add one explicitly in a later phase rather than leaving a silent path
-- open now).

grant select, insert on suppression_list to authenticated;
