-- Slice B, migration 2 of 5 - what campaign/client editing needs beyond
-- the Phase 1 columns: a human code + audience on campaigns, controller /
-- DPA details on clients, a per-agent daily target on the roster, and
-- integrity + audit around campaign_assignments. (clients and campaigns
-- already have audit triggers from migration 043.)

alter table campaigns
  add column if not exists code text,
  add column if not exists audience text not null default 'B2C';

alter table campaigns drop constraint if exists campaigns_audience_check;
alter table campaigns add constraint campaigns_audience_check check (audience in ('B2C', 'B2B'));
alter table campaigns drop constraint if exists campaigns_max_attempts_check;
alter table campaigns add constraint campaigns_max_attempts_check check (max_attempts between 1 and 50);
alter table campaigns drop constraint if exists campaigns_cooling_off_check;
alter table campaigns add constraint campaigns_cooling_off_check check (cooling_off_hours between 0 and 720);

create unique index if not exists campaigns_workspace_code_idx
  on campaigns (workspace_id, upper(code)) where code is not null;

-- A campaign's client must belong to the same workspace.
create or replace function guard_campaign_client() returns trigger
language plpgsql as $$
begin
  if new.client_id is not null and not exists (
    select 1 from clients c where c.id = new.client_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'client must belong to the campaign''s workspace';
  end if;
  return new;
end;
$$;
create trigger campaigns_guard_client
  before insert or update of client_id on campaigns
  for each row execute function guard_campaign_client();

alter table clients
  add column if not exists is_data_controller boolean not null default false,
  add column if not exists dpa_signed_on date;

alter table campaign_assignments
  add column if not exists daily_target int not null default 20;
alter table campaign_assignments drop constraint if exists campaign_assignments_daily_target_check;
alter table campaign_assignments add constraint campaign_assignments_daily_target_check
  check (daily_target between 1 and 1000);

-- Only active agents / team leads of the same workspace can be rostered,
-- and the campaign must be in that workspace too.
create or replace function guard_campaign_assignment() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from campaigns c where c.id = new.campaign_id and c.workspace_id = new.workspace_id) then
    raise exception 'campaign must belong to the assignment''s workspace';
  end if;
  if not exists (
    select 1 from profiles p
    where p.id = new.user_id and p.workspace_id = new.workspace_id
      and p.role in ('agent', 'team_lead') and p.is_active
  ) then
    raise exception 'only active agents or team leads in this workspace can be assigned to a campaign';
  end if;
  return new;
end;
$$;
create trigger campaign_assignments_guard
  before insert or update on campaign_assignments
  for each row execute function guard_campaign_assignment();

create trigger campaign_assignments_audit
  after insert or update or delete on campaign_assignments
  for each row execute function audit_row_change('campaign_assignment');
