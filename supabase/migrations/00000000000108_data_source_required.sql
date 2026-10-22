-- One lead pipeline: every uploaded list names a data source (its lawful basis
-- on file). Before this, an upload with "no source" created a batch and leads
-- but no data_sources / source_fetch_runs row, so Data showed "0 sources / No
-- imports yet" while uploads existed.
--
-- 1. lawful_basis gains 'unspecified', used ONLY by the backfill below to flag
--    old, source-less uploads for review. No signed-in user can create or
--    switch a source to it (trigger), and the importer refuses to use one.
-- 2. Rules for new rows:
--      * a lead whose source is 'upload' must carry a data_source_id (CHECK,
--        added NOT VALID, validated after the backfill);
--      * a lead_batches row must carry a data_source_id when a signed-in user
--        creates it (trigger). The service role (seed script, migrations) has
--        no auth.uid() and is exempt: the demo seed batch has no source on
--        purpose and must not count as a real import.
--    Not covered on purpose: leads added by hand (source 'manual': one person,
--    the data source is optional), leads from the inbound webhook (source is
--    the sender's label, e.g. 'webhook' or 'apollo'; the lawful basis is the
--    consent the sender must attest to per lead, stored with the lead) and
--    promoted phone-less contacts (they inherit the source of the file they
--    came from). The webhook never produces source 'upload': see
--    src/lib/leads/intake-process.ts, which renames that one reserved word.
-- 3. Backfill: per workspace, one 'Legacy uploads (basis unspecified)' source;
--    old source-less batches and their leads are linked to it, and a
--    source_fetch_runs row is written for each batch so Import history shows it.

-- 1 ----------------------------------------------------------------------
alter table data_sources drop constraint if exists data_sources_lawful_basis_check;
alter table data_sources add constraint data_sources_lawful_basis_check
  check (lawful_basis in ('consent', 'legitimate_interest', 'contract', 'not_personal_data', 'unspecified'));

create or replace function guard_unspecified_lawful_basis() returns trigger
language plpgsql as $$
begin
  -- auth.uid() is null for the service role and for migrations: only they may
  -- write 'unspecified'. Signed-in users may keep an existing one (rename it,
  -- deactivate it) but can never create one or move another source to it.
  if new.lawful_basis = 'unspecified'
     and auth.uid() is not null
     and (tg_op = 'INSERT' or old.lawful_basis is distinct from 'unspecified') then
    raise exception 'Choose a real lawful basis for this data source.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists data_sources_guard_unspecified on data_sources;
create trigger data_sources_guard_unspecified
  before insert or update of lawful_basis on data_sources
  for each row execute function guard_unspecified_lawful_basis();

-- 2 ----------------------------------------------------------------------
create or replace function require_batch_data_source() returns trigger
language plpgsql as $$
begin
  if new.data_source_id is null
     and auth.uid() is not null
     and (tg_op = 'INSERT' or old.data_source_id is not null) then
    raise exception 'Choose the data source for this list.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists lead_batches_require_source on lead_batches;
create trigger lead_batches_require_source
  before insert or update of data_source_id on lead_batches
  for each row execute function require_batch_data_source();

alter table leads drop constraint if exists leads_upload_requires_source;
alter table leads add constraint leads_upload_requires_source
  check (source is distinct from 'upload' or data_source_id is not null) not valid;

-- 3 ----------------------------------------------------------------------
do $$
declare
  w record;
  v_src uuid;
begin
  for w in
    select distinct x.workspace_id
    from (
      select workspace_id from lead_batches
       where data_source_id is null and source is distinct from 'demo seed'
      union
      select workspace_id from leads where source = 'upload' and data_source_id is null
    ) x
  loop
    insert into data_sources (workspace_id, name, source_type, lawful_basis, is_active, notes)
    values (
      w.workspace_id,
      'Legacy uploads (basis unspecified)',
      'manual_entry',
      'unspecified',
      true,
      'Created automatically for lists uploaded before every upload had to name a data source. Open it and set the real lawful basis and type; until then the importer will not use it.'
    )
    on conflict (workspace_id, name) do nothing;

    select id into v_src from data_sources
     where workspace_id = w.workspace_id and name = 'Legacy uploads (basis unspecified)';

    -- A history row per old batch (only those that do not have one yet).
    insert into source_fetch_runs (
      workspace_id, data_source_id, campaign_id, batch_id, triggered_by, params,
      started_at, finished_at, records_found, records_imported, status
    )
    select b.workspace_id, v_src, b.campaign_id, b.id, b.uploaded_by,
           jsonb_build_object('filename', b.source, 'legacy', true),
           b.created_at, b.created_at, b.row_count, b.row_count, 'complete'
      from lead_batches b
     where b.workspace_id = w.workspace_id
       and b.data_source_id is null
       and b.source is distinct from 'demo seed'
       and not exists (select 1 from source_fetch_runs r where r.batch_id = b.id);

    update leads l
       set data_source_id = v_src,
           source = coalesce(l.source, 'upload')
     where l.workspace_id = w.workspace_id
       and l.data_source_id is null
       and (
         l.source = 'upload'
         or l.batch_id in (
           select b.id from lead_batches b
            where b.workspace_id = w.workspace_id
              and b.data_source_id is null
              and b.source is distinct from 'demo seed'
         )
       );

    update lead_batches
       set data_source_id = v_src
     where workspace_id = w.workspace_id
       and data_source_id is null
       and source is distinct from 'demo seed';
  end loop;
end $$;

alter table leads validate constraint leads_upload_requires_source;
