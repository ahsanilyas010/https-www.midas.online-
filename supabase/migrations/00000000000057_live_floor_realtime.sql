-- Phase 5, migration 2 of 2 — Realtime for the live floor (spec: "LIVE
-- FLOOR (Realtime)"). Adding calls and attendance_events to the
-- supabase_realtime publication lets a workspace-scoped client subscribe
-- to postgres_changes and animate counts as they happen, rather than
-- polling. RLS still applies to what a subscribed client actually
-- receives — Realtime never bypasses it.
alter publication supabase_realtime add table calls;
alter publication supabase_realtime add table attendance_events;
