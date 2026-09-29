-- Phase 7, migration 1 of 5 — audit. Spec: "Triggers write every insert/
-- update/delete on leads, calls, campaigns, users, suppression_list and
-- twilio_credentials to audit_log with old and new JSON." campaigns and
-- users(profiles) already got triggers in Phase 1 (migration 043); this
-- adds the remaining three.

create trigger leads_audit
  after insert or update or delete on leads
  for each row execute function audit_row_change('lead');

create trigger calls_audit
  after insert or update or delete on calls
  for each row execute function audit_row_change('call');

create trigger suppression_list_audit
  after insert or update or delete on suppression_list
  for each row execute function audit_row_change('suppression_list');

create trigger twilio_credentials_audit
  after insert or update or delete on twilio_credentials
  for each row execute function audit_row_change('twilio_credentials');
