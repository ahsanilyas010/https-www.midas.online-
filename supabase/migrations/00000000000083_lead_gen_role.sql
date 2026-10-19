-- The Lead Gen seat: finds and loads leads (manually, by CSV, or through the
-- Zapier connector) and hands them to sales agents. A separate migration from
-- the policies that use it, because a new enum value can't be used in the
-- transaction that adds it.
alter type app_role add value if not exists 'lead_gen';
