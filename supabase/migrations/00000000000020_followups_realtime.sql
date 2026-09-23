-- Realtime due tray (section 4.7) needs postgres_changes events on
-- followups. Guarded so re-running this migration doesn't error if the
-- table's already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'followups'
  ) then
    alter publication supabase_realtime add table followups;
  end if;
end $$;
