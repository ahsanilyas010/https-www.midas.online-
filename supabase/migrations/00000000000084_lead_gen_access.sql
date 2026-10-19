-- Lead Gen seat, 1 of 4 - row access.
--
-- A lead_gen user finds / loads leads and hands them to sales agents. They
-- never dial, so every policy below is an explicit allow-list for lead_gen;
-- nothing here widens access to calls, recordings, QA, attendance, billing,
-- audit or Twilio tables (those policies list roles explicitly and simply
-- do not name lead_gen).
--
-- Visibility decision for leads: a lead_gen user reads
--   * leads they created        (created_by = me)
--   * leads they handed off     (assigned_by = me)
--   * leads nobody owns yet     (assigned_to is null)
-- They do not read other people's already-assigned leads (agent notes,
-- attempts and dispositions stay with sales). Workspace-wide counts for the
-- dashboard come from the aggregate-only RPC in migration 85.

alter table leads
  add column if not exists created_by uuid references profiles(id) on delete set null default auth.uid(),
  add column if not exists assigned_by uuid references profiles(id) on delete set null;

create index if not exists leads_workspace_created_by_idx on leads (workspace_id, created_by);
create index if not exists leads_workspace_assigned_by_idx on leads (workspace_id, assigned_by);

-- ---------------------------------------------------------------------
-- leads
drop policy if exists leads_select on leads;
create policy leads_select on leads for select using (
  workspace_id = auth_workspace_id()
  and (
    auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'qa_analyst')
    or (
      auth_role() = 'agent' and (
        assigned_to = auth.uid()
        or claimed_by = auth.uid()
        or campaign_id in (select my_campaign_ids())
      )
    )
    or (
      auth_role() = 'lead_gen' and (
        created_by = auth.uid()
        or assigned_by = auth.uid()
        or assigned_to is null
      )
    )
  )
);

-- Insert only: a lead enters unowned, unscreened and untouched. Everything
-- compliance-sensitive (screening, claim, attempts) stays at its default,
-- so a lead_gen user cannot self-screen or pre-assign a lead. Hand-off goes
-- through leadgen_assign_leads() / leadgen_auto_assign().
create policy leads_insert_lead_gen on leads for insert with check (
  workspace_id = auth_workspace_id()
  and auth_role() = 'lead_gen'
  and created_by = auth.uid()
  and assigned_to is null
  and assigned_by is null
  and claimed_by is null
  and screening_status = 'pending'
  and attempts = 0
  and status = 'new'
);

-- ---------------------------------------------------------------------
-- lead_batches: lead_gen reads and writes only its own batches.
create policy lead_batches_select_lead_gen on lead_batches for select using (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and uploaded_by = auth.uid()
);
create policy lead_batches_insert_lead_gen on lead_batches for insert with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and uploaded_by = auth.uid()
);

-- ---------------------------------------------------------------------
-- data_sources: lead_gen can see sources, and register new ones (insert
-- only: changing / deactivating a source stays with managers).
drop policy if exists data_sources_select on data_sources;
create policy data_sources_select on data_sources for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst', 'lead_gen')
);
create policy data_sources_insert_lead_gen on data_sources for insert with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and created_by = auth.uid()
);

-- source_fetch_runs: lead_gen manages its own import runs only.
create policy source_fetch_runs_select_lead_gen on source_fetch_runs for select using (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and triggered_by = auth.uid()
);
create policy source_fetch_runs_insert_lead_gen on source_fetch_runs for insert with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and triggered_by = auth.uid()
);
create policy source_fetch_runs_update_lead_gen on source_fetch_runs for update using (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and triggered_by = auth.uid()
) with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen' and triggered_by = auth.uid()
);

-- unphoned_contacts: an import may hold phone-less contacts. lead_gen can
-- add them and see the ones nobody has taken yet (needed to skip repeated
-- external refs); they cannot read or change contacts an agent is working.
create policy unphoned_contacts_select_lead_gen on unphoned_contacts for select using (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen'
  and assigned_to is null and promoted_lead_id is null
);
create policy unphoned_contacts_insert_lead_gen on unphoned_contacts for insert with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen'
  and assigned_to is null and promoted_lead_id is null
);

-- ---------------------------------------------------------------------
-- Storage: lead_gen may upload the raw import file (insert only - no read,
-- overwrite or delete) into its workspace folder of lead-uploads.
create policy lead_uploads_insert_lead_gen on storage.objects for insert with check (
  bucket_id = 'lead-uploads'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and auth_role() = 'lead_gen'
);

-- ---------------------------------------------------------------------
-- Inbound webhook token: lead_gen manages it like a manager does (the
-- table stores only a SHA-256 hash).
create policy lead_intake_tokens_lead_gen on lead_intake_tokens for all using (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen'
) with check (
  workspace_id = auth_workspace_id() and auth_role() = 'lead_gen'
);
