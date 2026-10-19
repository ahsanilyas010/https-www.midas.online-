-- Slice C: per-source performance and the compliance console's counts.
-- Both are security_invoker so they inherit the caller's RLS (leads and
-- calls are staff-only; a client or platform admin sees nothing).

create or replace view v_source_performance with (security_invoker = true) as
select
  ds.workspace_id,
  ds.id as data_source_id,
  ds.name,
  ds.source_type,
  ds.market,
  ds.lawful_basis,
  ds.is_active,
  count(l.id) as leads_loaded,
  count(l.id) filter (where l.screening_status = 'passed') as screened_passed,
  count(l.id) filter (where exists (
    select 1 from suppression_list s where s.workspace_id = l.workspace_id and s.phone_hash = l.phone_hash
  )) as suppressed,
  count(l.id) filter (where l.attempts > 0) as worked,
  count(l.id) filter (where exists (
    select 1 from calls cl join dispositions d on d.id = cl.disposition_id
    where cl.lead_id = l.id and d.outcome_group in ('connect', 'conversion')
  )) as contacted,
  count(l.id) filter (where exists (
    select 1 from calls cl join dispositions d on d.id = cl.disposition_id
    where cl.lead_id = l.id and d.outcome_group = 'conversion'
  )) as converted,
  (select count(*) from source_fetch_runs r where r.data_source_id = ds.id) as run_count,
  (select max(r.finished_at) from source_fetch_runs r where r.data_source_id = ds.id) as last_import_at
from data_sources ds
left join leads l on l.data_source_id = ds.id and l.workspace_id = ds.workspace_id
group by ds.id;

create or replace view v_compliance_stats with (security_invoker = true) as
select
  w.id as workspace_id,
  (select count(*) from leads l where l.workspace_id = w.id and l.screening_status = 'passed') as leads_passed,
  (select count(*) from leads l where l.workspace_id = w.id and l.screening_status = 'pending') as leads_pending,
  (select count(*) from leads l where l.workspace_id = w.id and l.screening_status = 'failed') as leads_failed,
  (select count(*) from leads l where l.workspace_id = w.id and l.screening_status = 'expired') as leads_expired,
  (select count(*) from leads l where l.workspace_id = w.id and exists (
    select 1 from suppression_list s where s.workspace_id = w.id and s.phone_hash = l.phone_hash
  )) as leads_blocked_by_suppression,
  (select count(*) from suppression_list s where s.workspace_id = w.id) as suppression_total,
  (select count(*) from lead_batches b where b.workspace_id = w.id and b.screened_at is not null) as batches_screened,
  (select count(*) from lead_batches b where b.workspace_id = w.id and b.screened_at is null) as batches_unscreened
from workspaces w;

grant select on v_source_performance, v_compliance_stats to authenticated;
