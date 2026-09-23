-- Two RLS bugs found while wiring Phase 3, both invisible to testing done
-- as a superuser/service-role connection (which bypasses RLS entirely) —
-- only surfaced once queries were run as the `authenticated` role:
--
-- 1. profiles_select's team_lead branch had an inline subquery selecting
--    from profiles *within profiles' own policy*, which Postgres cannot
--    evaluate without re-triggering the same policy — infinite recursion
--    ("42P17"). Every other team-scoping policy already went through the
--    my_team_members() security-definer function for exactly this reason;
--    this one didn't. Fixed the same way, via a new my_team_id() helper.
--
-- 2. suppression_select restricted reads to managers/qa only. But
--    v_dialable_leads is `security_invoker`, so its LEFT JOIN against
--    suppression_list is *also* subject to the querying user's RLS — for
--    an agent, that policy made every suppression_list row invisible,
--    which made `s.phone_e164 is null` always true from their vantage
--    point. In other words: an agent querying the view would have seen a
--    suppressed number as dialable, silently defeating the compliance
--    gate for exactly the role that matters most. The list itself isn't
--    sensitive (reason + who added it, already audited); the fix is to
--    let any signed-in user read it, same as dispositions.

create or replace function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid()
$$;
revoke execute on function my_team_id() from public, anon;
grant execute on function my_team_id() to authenticated;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or is_manager()
  or auth_role() = 'qa'
  or (auth_role() = 'team_lead' and team_id = my_team_id())
);

drop policy if exists suppression_select on suppression_list;
create policy suppression_select on suppression_list for select
  using (auth.uid() is not null);
