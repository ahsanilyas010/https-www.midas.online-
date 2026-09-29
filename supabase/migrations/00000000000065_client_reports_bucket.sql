-- Phase 7, migration 4 of 5 — storage for the monthly client PDF report
-- (spec: "monthly PDF report generated server-side and stored in
-- Storage"). Private; served through a manager/client-gated download
-- route using the service-role client, same pattern as call-recordings.
insert into storage.buckets (id, name, public)
values ('client-reports', 'client-reports', false)
on conflict (id) do nothing;
