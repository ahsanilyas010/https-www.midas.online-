-- Follow-up tray (header bell) subscribes to the signed-in agent's own
-- callbacks; make the table part of the realtime publication. RLS still
-- governs which rows each subscriber receives.
alter publication supabase_realtime add table callbacks;
