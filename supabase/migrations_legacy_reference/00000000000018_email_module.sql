-- Section 4.8 — email module.

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text,
  merge_fields text[],
  from_name text,
  from_email text,
  reply_to text,
  requires_approval boolean not null default true,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table email_suppression (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);

create table email_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  campaign_id uuid not null references campaigns(id),
  template_id uuid references email_templates(id),
  agent_id uuid not null references profiles(id),
  to_email text not null,
  subject_sent text not null,
  body_sent_html text not null,
  status text not null default 'queued' check (status in
    ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained',
     'failed', 'blocked_unsubscribed')),
  provider_message_id text,
  provider_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_sends_lead_idx on email_sends (lead_id, created_at desc);

-- Non-negotiable: sending to a suppressed address is rejected by the
-- database, not just the UI — even if the API is called directly.
create or replace function guard_email_suppression() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from email_suppression where email = new.to_email) then
    raise exception 'blocked: % is on the email suppression list', new.to_email;
  end if;
  return new;
end;
$$;

create trigger email_sends_guard_suppression
  before insert on email_sends
  for each row execute function guard_email_suppression();

alter table email_templates enable row level security;
alter table email_suppression enable row level security;
alter table email_sends enable row level security;

create policy email_templates_select on email_templates for select using (auth.uid() is not null);
create policy email_templates_write on email_templates for all
  using (is_manager()) with check (is_manager());

-- Suppression here mirrors suppression_list: insert always allowed
-- (an unsubscribe must never be blocked), read open to any signed-in
-- user (the send-time check needs it), delete manager-only.
create policy email_suppression_select on email_suppression for select using (auth.uid() is not null);
create policy email_suppression_insert on email_suppression for insert with check (auth.uid() is not null);
create policy email_suppression_delete on email_suppression for delete using (is_manager());

create policy email_sends_select on email_sends for select using (
  agent_id = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and agent_id in (select my_team_members()))
);
create policy email_sends_insert on email_sends for insert with check (
  agent_id = auth.uid() or is_manager()
);
create policy email_sends_update on email_sends for update using (is_manager());

grant select, insert, update, delete on email_templates to authenticated;
grant select, insert on email_suppression to authenticated;
grant delete on email_suppression to authenticated;
grant select, insert on email_sends to authenticated;
