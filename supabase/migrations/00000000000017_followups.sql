-- Section 4.7 — follow-ups and reminders.

create table followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id),
  assigned_to uuid not null references profiles(id),
  created_by uuid references profiles(id),
  followup_type text not null check (followup_type in
    ('callback', 'send_email', 'send_info', 'client_handover', 'other')),
  due_at timestamptz not null,
  due_at_lead_local timestamptz,
  note text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'pending' check (status in
    ('pending', 'done', 'missed', 'cancelled', 'snoozed')),
  reminded_at timestamptz,
  escalated_at timestamptz,
  completed_at timestamptz,
  completed_call_id uuid references call_attempts(id),
  snooze_count int not null default 0,
  created_at timestamptz not null default now()
);
create index followups_due_idx on followups (assigned_to, status, due_at);
create index followups_lead_idx on followups (lead_id, created_at desc);

alter table followups enable row level security;

create policy followups_select on followups for select using (
  assigned_to = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and assigned_to in (select my_team_members()))
);
create policy followups_insert on followups for insert with check (
  assigned_to = auth.uid() or is_manager()
);
create policy followups_update on followups for update using (
  assigned_to = auth.uid()
  or is_manager()
  or (auth_role() = 'team_lead' and assigned_to in (select my_team_members()))
);

grant select, insert, update on followups to authenticated;

-- Snooze cap: max 2 snoozes, 15 minutes each (spec section 4.7). Enforced
-- here rather than trusted to the client.
create or replace function snooze_followup(p_followup_id uuid)
returns followups
language plpgsql security definer set search_path = public as $$
declare
  v_followup followups%rowtype;
begin
  select * into v_followup from followups where id = p_followup_id for update;
  if not found then
    raise exception 'follow-up not found';
  end if;
  if not (is_manager() or v_followup.assigned_to = auth.uid()) then
    raise exception 'not your follow-up';
  end if;
  if v_followup.snooze_count >= 2 then
    raise exception 'maximum 2 snoozes reached — resolve it with a disposition instead';
  end if;

  update followups set
    due_at = now() + interval '15 minutes',
    snooze_count = snooze_count + 1,
    status = 'snoozed'
  where id = p_followup_id
  returning * into v_followup;

  return v_followup;
end;
$$;

revoke execute on function snooze_followup(uuid) from public, anon;
grant execute on function snooze_followup(uuid) to authenticated;

-- Scheduled housekeeping (pg_cron, no external dependency): overdue by 2h
-- -> missed; missed for 24h -> reassigned to the team lead's bucket.
create extension if not exists pg_cron with schema extensions;

create or replace function sweep_followups() returns void
language plpgsql security definer set search_path = public as $$
begin
  update followups
  set status = 'missed'
  where status in ('pending', 'snoozed')
    and due_at < now() - interval '2 hours';

  update followups f
  set assigned_to = t.team_lead_id,
      escalated_at = now()
  from profiles p
  join teams t on t.id = p.team_id
  where f.assigned_to = p.id
    and f.status = 'missed'
    and f.escalated_at is null
    and f.due_at < now() - interval '24 hours'
    and t.team_lead_id is not null;
end;
$$;

revoke execute on function sweep_followups() from public, anon, authenticated;

select cron.schedule('sweep-followups', '*/15 * * * *', 'select sweep_followups();');
