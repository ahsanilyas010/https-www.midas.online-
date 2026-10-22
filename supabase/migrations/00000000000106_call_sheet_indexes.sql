-- Call sheet: indexes behind the per-lead "latest outcome" and "my pending
-- callback" lookups, and the appointment ordering.
create index if not exists calls_lead_disposed_idx on calls (lead_id, disposed_at desc) where disposition_id is not null;
create index if not exists callbacks_lead_agent_pending_idx on callbacks (lead_id, agent_id, due_at) where status = 'pending';
create index if not exists leads_workspace_assigned_appt_idx on leads (workspace_id, assigned_to, appointment_at);
