-- Phase 2, migration 1 of 7 — the columns the compliance gate
-- (next_lead_for_agent, migration 050) actually reads. leads/lead_batches
-- themselves were created as minimal shells in migration 042 (Phase 1);
-- this extends leads with what a real dialable-lead check needs.

alter table leads
  add column screening_status text not null default 'pending'
    check (screening_status in ('pending', 'passed', 'failed', 'expired')),
  add column screened_at timestamptz,
  add column phone_hash text,
  add column attempts int not null default 0,
  add column last_attempt_at timestamptz,
  -- A short-lived claim so two agents calling next_lead_for_agent
  -- concurrently never receive the same lead (FOR UPDATE SKIP LOCKED only
  -- protects overlapping transactions — the claim is what survives after
  -- the function's transaction commits and the row lock releases).
  add column claimed_by uuid references auth.users(id),
  add column claimed_at timestamptz;

create index leads_workspace_campaign_screening_idx
  on leads (workspace_id, campaign_id, screening_status);
create index leads_phone_hash_idx on leads (workspace_id, phone_hash);
create index leads_claimed_idx on leads (workspace_id, claimed_by, claimed_at);

-- Demo workspaces may only ever surface these numbers as dialable (spec:
-- "if workspace.is_demo, phone is in DEMO_ALLOWED_NUMBERS"). Populated by
-- the seed script; null/empty for every real workspace, where it has no
-- effect.
alter table workspaces add column demo_allowed_numbers text[] not null default '{}';

create or replace function compute_phone_hash(p_phone text) returns text
language sql immutable as $$
  select encode(extensions.digest(p_phone, 'sha256'), 'hex')
$$;

create or replace function set_lead_phone_hash() returns trigger
language plpgsql as $$
begin
  if new.phone_e164 is not null then
    new.phone_hash := compute_phone_hash(new.phone_e164);
  end if;
  return new;
end;
$$;

create trigger leads_set_phone_hash
  before insert or update of phone_e164 on leads
  for each row execute function set_lead_phone_hash();

-- Migration 044's leads_rw policy granted every staff role full CRUD on
-- leads directly. That was fine when leads had no compliance-sensitive
-- columns, but attempts/claimed_by/claimed_at/screening_status must now
-- only ever change through next_lead_for_agent()/record_call_attempt()
-- (migrations 050/051), which run as SECURITY DEFINER and bypass RLS —
-- an agent must never be able to reach the same effect with a direct
-- `update leads set ...`. Replace it with a manager-only write policy;
-- read access for all staff roles is unchanged.
drop policy if exists leads_rw on leads;

create policy leads_select on leads for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);
create policy leads_write_manager on leads for insert with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
create policy leads_update_manager on leads for update using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
create policy leads_delete_manager on leads for delete using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);
