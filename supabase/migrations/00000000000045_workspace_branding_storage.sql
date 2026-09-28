-- Phase 1, migration 8 of 9 — Storage buckets for branding and the
-- onboarding wizard's first data upload, both pathed by workspace_id with
-- RLS on storage.objects (never by UI).

insert into storage.buckets (id, name, public)
values ('workspace-branding', 'workspace-branding', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('lead-uploads', 'lead-uploads', false)
on conflict (id) do nothing;

-- workspace-branding is public-read (unlike the private compliance-
-- evidence bucket from legacy migration 024) because a logo needs to
-- render on /login before anyone is signed in. Writes are still gated by
-- workspace + role.
create policy branding_select on storage.objects for select using (
  bucket_id = 'workspace-branding'
);
create policy branding_insert on storage.objects for insert with check (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and is_workspace_manager()
);
create policy branding_update on storage.objects for update using (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and is_workspace_manager()
);
create policy branding_delete on storage.objects for delete using (
  bucket_id = 'workspace-branding'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and is_workspace_manager()
);

-- lead-uploads is private; readable/writable only by staff of the owning
-- workspace who could also write lead_batches rows.
create policy lead_uploads_rw on storage.objects for all using (
  bucket_id = 'lead-uploads'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
) with check (
  bucket_id = 'lead-uploads'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead')
);
