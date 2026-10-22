-- A data source's provider URL, when given, must be an http(s) link. The app
-- validates it too (zod); this keeps bad values out whatever writes the row.
-- Added NOT VALID so any old free-text value cannot block the migration, then
-- validated only if every existing row already complies.
alter table data_sources drop constraint if exists data_sources_provider_url_check;
alter table data_sources add constraint data_sources_provider_url_check
  check (provider_url is null or provider_url ~* '^https?://[^[:space:]]+$') not valid;

do $$
begin
  alter table data_sources validate constraint data_sources_provider_url_check;
exception when check_violation then
  raise notice 'data_sources_provider_url_check left NOT VALID: existing rows with a non-URL provider_url need cleaning up';
end $$;
