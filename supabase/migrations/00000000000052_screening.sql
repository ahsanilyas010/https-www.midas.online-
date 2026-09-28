-- Phase 2, migration 6 of 7 — screening. A stub, per spec: "Screening
-- (TPS/CTPS for UK, National DNC for US) is a stub that records
-- screened_at and an evidence file; expose a ScreeningProvider interface
-- for a real vendor." The interface itself lives in application code
-- (src/lib/compliance/screening.ts); this is the storage + the one
-- function that stamps the result.

insert into storage.buckets (id, name, public)
values ('screening-evidence', 'screening-evidence', false)
on conflict (id) do nothing;

alter table lead_batches add column evidence_url text;

create policy screening_evidence_rw on storage.objects for all using (
  bucket_id = 'screening-evidence'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and is_workspace_manager()
) with check (
  bucket_id = 'screening-evidence'
  and (storage.foldername(name))[1] = auth_workspace_id()::text
  and is_workspace_manager()
);

-- Marks every unscreened lead in a batch as passed (the stub's only
-- outcome — a real provider would also produce 'failed' rows, which this
-- function has no way to determine). Manager-only: screening is a
-- compliance action, not something an agent triggers.
create or replace function screen_lead_batch(p_batch_id uuid, p_evidence_url text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid := auth_workspace_id();
  v_count int;
begin
  if not is_workspace_manager() then
    raise exception 'only a workspace manager can screen a batch';
  end if;

  update leads
  set screening_status = 'passed', screened_at = now()
  where batch_id = p_batch_id
    and workspace_id = v_workspace_id
    and screening_status = 'pending';
  get diagnostics v_count = row_count;

  update lead_batches
  set screened_at = now(), status = 'ready', evidence_url = coalesce(p_evidence_url, evidence_url)
  where id = p_batch_id and workspace_id = v_workspace_id;

  return v_count;
end;
$$;

revoke execute on function screen_lead_batch(uuid, text) from public, anon;
grant execute on function screen_lead_batch(uuid, text) to authenticated;
