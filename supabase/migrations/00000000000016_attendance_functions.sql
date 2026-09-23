-- Clock in/out and aux-state RPCs. SECURITY DEFINER so they can write
-- attendance_sessions/aux_logs despite agents having no direct write
-- access to those tables (attendance_no_self_edit) — each function does
-- its own auth.uid()-scoped check instead of relying on table RLS.

create or replace function clock_in(p_ip inet default null, p_device text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shift shifts%rowtype;
  v_local_now timestamp;
  v_local_date date;
  v_local_time time;
  v_work_date date;
  v_expected_start timestamptz;
  v_late_minutes int;
  v_session_id uuid;
  v_existing attendance_sessions%rowtype;
  v_found boolean;
begin
  select s.* into v_shift
  from shift_assignments sa
  join shifts s on s.id = sa.shift_id
  where sa.user_id = auth.uid()
    and sa.effective_from <= current_date
    and (sa.effective_to is null or sa.effective_to >= current_date)
  order by sa.effective_from desc
  limit 1;

  if not found then
    raise exception 'no active shift assignment';
  end if;

  -- A session that starts 22:00 PKT and runs past midnight belongs to the
  -- work_date the shift *started* on, not the calendar date it's currently.
  v_local_now := now() at time zone v_shift.timezone;
  v_local_date := v_local_now::date;
  v_local_time := v_local_now::time;

  if v_shift.crosses_midnight and v_local_time < v_shift.end_time then
    v_work_date := v_local_date - 1;
  else
    v_work_date := v_local_date;
  end if;

  select * into v_existing from attendance_sessions
  where user_id = auth.uid() and work_date = v_work_date
  for update;
  v_found := found;

  if v_found and v_existing.clock_in_at is not null then
    raise exception 'already clocked in for %', v_work_date;
  end if;

  v_expected_start := (v_work_date + v_shift.start_time) at time zone v_shift.timezone;
  v_late_minutes := greatest(0,
    (extract(epoch from (now() - (v_expected_start + (v_shift.grace_minutes || ' minutes')::interval))) / 60)::int
  );

  if v_found then
    update attendance_sessions set
      clock_in_at = now(), clock_in_ip = p_ip, clock_in_device = p_device,
      shift_id = v_shift.id,
      status = (case when v_late_minutes > 0 then 'late' else 'present' end)::attendance_status,
      late_minutes = v_late_minutes
    where id = v_existing.id
    returning id into v_session_id;
  else
    insert into attendance_sessions
      (user_id, shift_id, work_date, clock_in_at, clock_in_ip, clock_in_device, status, late_minutes)
    values (
      auth.uid(), v_shift.id, v_work_date, now(), p_ip, p_device,
      (case when v_late_minutes > 0 then 'late' else 'present' end)::attendance_status, v_late_minutes
    )
    returning id into v_session_id;
  end if;

  insert into aux_logs (session_id, user_id, state) values (v_session_id, auth.uid(), 'available');

  return v_session_id;
end;
$$;

create or replace function clock_out(p_ip inet default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session attendance_sessions%rowtype;
  v_open_aux aux_logs%rowtype;
  v_worked_minutes int;
  v_break_minutes int;
begin
  select * into v_session from attendance_sessions
  where user_id = auth.uid() and clock_in_at is not null and clock_out_at is null
  order by work_date desc
  limit 1
  for update;

  if not found then
    raise exception 'not currently clocked in';
  end if;

  select * into v_open_aux from aux_logs
  where session_id = v_session.id and ended_at is null
  for update;

  if found then
    update aux_logs set ended_at = now(), duration_seconds = extract(epoch from (now() - started_at))::int
    where id = v_open_aux.id;
  end if;

  select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at))), 0)::int / 60
  into v_break_minutes
  from aux_logs where session_id = v_session.id and state in ('break', 'lunch');

  v_worked_minutes := extract(epoch from (now() - v_session.clock_in_at))::int / 60;

  update attendance_sessions set
    clock_out_at = now(),
    clock_out_ip = p_ip,
    worked_minutes = v_worked_minutes,
    break_minutes = v_break_minutes,
    productive_minutes = greatest(v_worked_minutes - v_break_minutes, 0)
  where id = v_session.id;

  return v_session.id;
end;
$$;

create or replace function set_aux_state(p_state aux_state, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session attendance_sessions%rowtype;
  v_open aux_logs%rowtype;
  v_new_id uuid;
begin
  select * into v_session from attendance_sessions
  where user_id = auth.uid() and clock_in_at is not null and clock_out_at is null
  order by work_date desc limit 1;

  if not found then
    raise exception 'not currently clocked in';
  end if;

  select * into v_open from aux_logs where session_id = v_session.id and ended_at is null for update;
  if found then
    update aux_logs set ended_at = now(), duration_seconds = extract(epoch from (now() - started_at))::int
    where id = v_open.id;
  end if;

  insert into aux_logs (session_id, user_id, state, reason)
  values (v_session.id, auth.uid(), p_state, p_reason)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function clock_in(inet, text) from public, anon;
revoke execute on function clock_out(inet) from public, anon;
revoke execute on function set_aux_state(aux_state, text) from public, anon;
grant execute on function clock_in(inet, text) to authenticated;
grant execute on function clock_out(inet) to authenticated;
grant execute on function set_aux_state(aux_state, text) to authenticated;
