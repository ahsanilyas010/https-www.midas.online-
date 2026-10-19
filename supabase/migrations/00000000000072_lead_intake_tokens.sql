-- Slice B, migration 5 of 5 - per-workspace inbound lead webhook token and
-- hand-off of promoted contacts.
--
-- The inbound webhook (POST /api/leads/inbound) is unauthenticated from
-- Supabase's point of view, so it authenticates with a per-workspace bearer
-- token. Only the SHA-256 hash is stored; the plaintext token is shown to
-- the manager once, at creation / rotation. The route looks the hash up
-- with the service role, so no policy admits anon or non-managers.

create table lead_intake_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz
);

alter table lead_intake_tokens enable row level security;

create policy lead_intake_tokens_manager on lead_intake_tokens for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

grant select, insert, update, delete on lead_intake_tokens to authenticated;

create trigger lead_intake_tokens_audit
  after insert or update or delete on lead_intake_tokens
  for each row execute function audit_row_change('lead_intake_token');

-- When promote_unphoned_contact() (slice C) turns a contact into a lead,
-- hand the new lead to the agent the contact was assigned to, and carry
-- over the contact's names / notes so nothing is lost.
create or replace function assign_promoted_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.promoted_lead_id is not null and old.promoted_lead_id is distinct from new.promoted_lead_id then
    update leads
    set assigned_to = coalesce(assigned_to, new.assigned_to),
        company_name = coalesce(company_name, new.company_name),
        city = coalesce(city, new.city),
        country_code = coalesce(country_code, new.country_hint),
        source = coalesce(source, 'promoted_contact')
    where id = new.promoted_lead_id and workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;

create trigger unphoned_contacts_assign_promoted
  after update of promoted_lead_id on unphoned_contacts
  for each row execute function assign_promoted_lead();
