-- Flexible leads (call-sheet data layer): first-class optional fields that an
-- import can fill. All nullable; existing rows and policies are unaffected
-- (leads RLS is row-level, so the new columns inherit it, and the generic
-- audit trigger already records whole-row changes).
--   website         the company's website
--   contact_name    a contact person when it differs from the lead's name
--   group_label     free-text list/column label used to group leads on a board
--   next_step       what to do next
--   appointment_at  follow-up / appointment date-time
--   last_contact_at an imported "last contact" date (calls we place keep using
--                   last_attempt_at)
-- Notes already live in agent_notes; every other imported column goes into
-- the existing leads.custom jsonb.
alter table leads
  add column if not exists website text,
  add column if not exists contact_name text,
  add column if not exists group_label text,
  add column if not exists next_step text,
  add column if not exists appointment_at timestamptz,
  add column if not exists last_contact_at timestamptz;

create index if not exists leads_workspace_group_idx on leads (workspace_id, group_label);
