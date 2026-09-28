-- Phase 3, migration 2 of 6 — Twilio-specific call-lifecycle columns and
-- the recordings bucket. calls itself (workspace_id, lead_id, agent_id,
-- disposition_id, ...) was created minimally in Phase 2 (migration 049)
-- for the compliance gate's bookkeeping; this adds what the real dialer
-- needs on top of it.

alter table calls
  add column provider_call_sid text,
  add column direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  add column status text not null default 'initiated'
    check (status in ('initiated', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled')),
  add column from_number text,
  add column to_number text,
  add column recording_sid text,
  add column recording_path text;

create unique index calls_workspace_provider_sid_idx on calls (workspace_id, provider_call_sid) where provider_call_sid is not null;

-- Private, per-workspace — recordings are downloaded from Twilio into
-- here and then deleted from Twilio (spec: "downloads the file into
-- Supabase Storage under the workspace path, stores the path on the call
-- row, then deletes it from Twilio"). No storage.objects policy grants
-- any authenticated role direct access; every read goes through a
-- manager/qa-gated server action using the service-role client, same
-- pattern as compliance-evidence in the legacy build.
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
