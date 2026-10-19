-- Zoom Phone (Smart Embed) call tracking. Calls are placed from the agent's
-- browser through Zoom's iframe; the browser reports lifecycle events back
-- through a server action. Existing Twilio columns stay in place (unused).
alter table calls
  add column provider text not null default 'zoom',
  add column zoom_call_id text,
  add column zoom_call_log_id text,
  add column duration_seconds integer,
  add column recording_url text,
  add column ai_summary jsonb;

-- A Zoom call id can only belong to one call row per workspace.
create unique index calls_workspace_zoom_call_idx on calls (workspace_id, zoom_call_id) where zoom_call_id is not null;
create index calls_agent_open_idx on calls (workspace_id, agent_id, created_at desc) where zoom_call_id is null;
