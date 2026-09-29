-- Phase 6, migration 3 of 3 — QA. Scorecard templates with weighted
-- criteria and fatal-error rules (spec: "a fatal fails the call"). A QA
-- analyst scores against the recording, leaves coaching notes, and the
-- agent must acknowledge — enforced by acknowledged_at being settable
-- only by the scored agent themselves, never the QA analyst.

create table qa_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table qa_criteria (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id uuid not null references qa_templates(id) on delete cascade,
  label text not null,
  weight numeric not null default 1 check (weight >= 0),
  is_fatal boolean not null default false,
  sort int not null default 0
);

create table qa_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  template_id uuid not null references qa_templates(id),
  qa_analyst_id uuid not null references auth.users(id),
  agent_id uuid not null references auth.users(id),
  total_score numeric not null default 0,
  passed boolean not null default true,
  fatal_breach boolean not null default false,
  coaching_notes text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table qa_criterion_results (
  id uuid primary key default gen_random_uuid(),
  qa_score_id uuid not null references qa_scores(id) on delete cascade,
  criterion_id uuid not null references qa_criteria(id),
  met boolean not null,
  unique (qa_score_id, criterion_id)
);

create index qa_criteria_template_idx on qa_criteria (template_id, sort);
create index qa_scores_workspace_agent_idx on qa_scores (workspace_id, agent_id, created_at desc);
create index qa_scores_call_idx on qa_scores (call_id);

alter table qa_templates enable row level security;
alter table qa_criteria enable row level security;
alter table qa_scores enable row level security;
alter table qa_criterion_results enable row level security;

-- Templates/criteria: readable by all staff (an agent should be able to
-- see what they're scored against), writable by managers and QA analysts.
create policy qa_templates_select on qa_templates for select using (workspace_id = auth_workspace_id());
create policy qa_templates_write on qa_templates for all using (
  workspace_id = auth_workspace_id() and (is_workspace_manager() or auth_role() = 'qa_analyst')
) with check (
  workspace_id = auth_workspace_id() and (is_workspace_manager() or auth_role() = 'qa_analyst')
);

create policy qa_criteria_select on qa_criteria for select using (workspace_id = auth_workspace_id());
create policy qa_criteria_write on qa_criteria for all using (
  workspace_id = auth_workspace_id() and (is_workspace_manager() or auth_role() = 'qa_analyst')
) with check (
  workspace_id = auth_workspace_id() and (is_workspace_manager() or auth_role() = 'qa_analyst')
);

-- Scores: managers/QA see everything; an agent sees only their own scores
-- (to review and acknowledge) — never someone else's coaching notes.
create policy qa_scores_select on qa_scores for select using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or auth_role() = 'qa_analyst' or agent_id = auth.uid()
  )
);
create policy qa_scores_insert on qa_scores for insert with check (
  workspace_id = auth_workspace_id() and (is_workspace_manager() or auth_role() = 'qa_analyst')
);
-- An agent may only ever set acknowledged_at on their own row; a
-- guard trigger below stops them touching anything else on it.
create policy qa_scores_update on qa_scores for update using (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or auth_role() = 'qa_analyst' or agent_id = auth.uid()
  )
) with check (
  workspace_id = auth_workspace_id() and (
    is_workspace_manager() or auth_role() = 'qa_analyst' or agent_id = auth.uid()
  )
);

create or replace function guard_qa_score_ack() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.agent_id and not (is_workspace_manager() or auth_role() = 'qa_analyst') then
    if new.total_score is distinct from old.total_score
       or new.passed is distinct from old.passed
       or new.fatal_breach is distinct from old.fatal_breach
       or new.coaching_notes is distinct from old.coaching_notes
       or new.call_id is distinct from old.call_id
    then
      raise exception 'the scored agent can only acknowledge a QA score, not edit it';
    end if;
  end if;
  return new;
end;
$$;

create trigger qa_scores_guard_ack
  before update on qa_scores
  for each row execute function guard_qa_score_ack();

create policy qa_criterion_results_select on qa_criterion_results for select using (
  exists (
    select 1 from qa_scores s
    where s.id = qa_criterion_results.qa_score_id
      and s.workspace_id = auth_workspace_id()
      and (is_workspace_manager() or auth_role() = 'qa_analyst' or s.agent_id = auth.uid())
  )
);
create policy qa_criterion_results_insert on qa_criterion_results for insert with check (
  exists (
    select 1 from qa_scores s
    where s.id = qa_criterion_results.qa_score_id
      and s.workspace_id = auth_workspace_id()
      and (is_workspace_manager() or auth_role() = 'qa_analyst')
  )
);

grant select, insert, update, delete on qa_templates, qa_criteria to authenticated;
grant select, insert, update on qa_scores to authenticated;
grant select, insert on qa_criterion_results to authenticated;
