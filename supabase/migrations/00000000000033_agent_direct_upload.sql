-- "Upload for agent" — an admin can now attach a CSV batch to a specific
-- agent (or a whole team, fanned out round-robin) at upload time instead
-- of importing generically and hand-assigning each lead afterward via the
-- "Assign to..." dropdown on the campaign leads table. That dropdown
-- stays as the fallback path for reassignment/edge cases; this is a new,
-- faster primary path for fresh intake.
--
-- Recorded on source_fetch_runs rather than the long-unused lead_batches
-- table — source_fetch_runs is the table every import path (vendor CSV
-- and every connector fetch) already writes to and that the admin/data
-- "Fetch history" tab already reads, so this keeps one tracking table
-- instead of reviving a second, parallel one nothing else touches.
--
-- skip_screening: a direct-to-agent upload is explicitly exempt from the
-- suppression-screening step (an intentional compliance exception the
-- requester chose, not a workflow shortcut) so the agent can start
-- dialing immediately. This never overrides an actual suppression-list
-- hit — importLeads() already sets do_not_call/screening_status='blocked'
-- for a matched number before this flag is ever consulted.

alter table source_fetch_runs
  add column assigned_to uuid references profiles(id),
  add column assigned_team_id uuid references teams(id),
  add column skip_screening boolean not null default false;
