-- The one-click unsubscribe link is clicked by an external email
-- recipient, not a signed-in user of this app — the insert has to work
-- for `anon`, same non-negotiable principle as the phone suppression
-- list: an opt-out must never be blocked.
drop policy if exists email_suppression_insert on email_suppression;
create policy email_suppression_insert on email_suppression for insert with check (true);
grant insert on email_suppression to anon;
