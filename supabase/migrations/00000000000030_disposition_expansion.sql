-- Adds the outcome set the client's own spreadsheets have been using
-- (visible in the disposition badges on the source sheets) alongside the
-- existing global dispositions, rather than replacing them — agents keep
-- every option they already have, plus these. campaign_id null makes them
-- global, same as the existing 14 rows.

insert into dispositions
  (campaign_id, code, label, category, is_terminal, sets_dnc, requires_followup, requires_note, sort_order)
values
  (null, 'project_finished', 'Project Finished', 'connected_negative', true, false, false, false, 150),
  (null, 'answering_machine', 'Answering Machine', 'no_contact', false, false, false, false, 160),
  (null, 'number_busy', 'Number Busy', 'no_contact', false, false, false, false, 170),
  (null, 'schedule_callback', 'Schedule Call Back', 'connected_neutral', false, false, true, false, 180),
  (null, 'dead_air', 'Dead Air', 'invalid', false, false, false, false, 190),
  (null, 'do_not_call', 'Do Not Call', 'compliance', true, true, false, true, 200),
  (null, 'not_interested', 'Not Interested', 'connected_negative', true, false, false, false, 210),
  (null, 'hang_up', 'Hang Up', 'connected_negative', true, false, false, false, 220),
  (null, 'appointment_set', 'Appointment set', 'connected_positive', true, false, true, false, 230),
  (null, 'not_available', 'Not Available', 'no_contact', false, false, false, false, 240),
  (null, 'email_sent_no_call', 'Email Sent/ No call', 'no_contact', false, false, false, false, 250),
  (null, 'email_sent_and_called', 'Email Sent and Called', 'connected_neutral', false, false, false, false, 260),
  (null, 'interested_follow_up', 'Interested-Follow up', 'connected_positive', false, false, true, false, 270),
  (null, 'number_disconnected', 'Number Disconnected', 'invalid', true, false, false, false, 280),
  (null, 'wrong_person', 'wrong person', 'connected_neutral', true, false, false, false, 290),
  (null, 'already_have_team', 'already have team', 'connected_negative', true, false, false, false, 300)
on conflict (campaign_id, code) do nothing;
