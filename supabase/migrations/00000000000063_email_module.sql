-- Phase 7, migration 2 of 5 — email. Spec: "Approved templates only,
-- merge fields, unsubscribe link, send log per lead, via Resend."

-- leads never had an email column (migration 042's shell only carries
-- phone_e164/full_name) — the email module needs somewhere to send to.
alter table leads add column email text;

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  subject text not null,
  body_md text not null,
  approved boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table email_suppression (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  template_id uuid references email_templates(id),
  to_email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'suppressed')),
  provider_message_id text,
  error text,
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index email_log_workspace_idx on email_log (workspace_id, created_at desc);
create index email_suppression_workspace_email_idx on email_suppression (workspace_id, email);

alter table email_templates enable row level security;
alter table email_suppression enable row level security;
alter table email_log enable row level security;

create policy email_templates_select on email_templates for select using (workspace_id = auth_workspace_id());
create policy email_templates_write on email_templates for all using (
  workspace_id = auth_workspace_id() and is_workspace_manager()
) with check (
  workspace_id = auth_workspace_id() and is_workspace_manager()
);

-- Suppression is checked server-side before every send (service role) —
-- staff can still see the list for transparency.
create policy email_suppression_select on email_suppression for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);

create policy email_log_select on email_log for select using (
  workspace_id = auth_workspace_id()
  and auth_role() in ('super_admin', 'ops_manager', 'team_lead', 'agent', 'qa_analyst')
);

grant select, insert, update, delete on email_templates to authenticated;
grant select on email_suppression to authenticated;
grant select on email_log to authenticated;

create trigger email_templates_audit
  after insert or update or delete on email_templates
  for each row execute function audit_row_change('email_template');
