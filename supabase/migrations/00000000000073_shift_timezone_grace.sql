-- Slice C: shifts need a timezone and a late-grace so attendance summaries
-- can say whether a clock-in was late. Legacy shifts carried both.
alter table shifts
  add column if not exists timezone text not null default 'UTC',
  add column if not exists grace_minutes int not null default 10 check (grace_minutes >= 0);

-- Shift assignments: an assignment can be ended (effective_to) without
-- deleting history; unassigning is a plain delete by a manager (policy
-- shift_assignments_write already allows it).
alter table shift_assignments
  add column if not exists effective_to date;
