-- =====================================================================
-- 17: STEP 1J - STAFF ROSTER + NURSING TRAINEE PROGRAMS
-- (run AFTER 01, 02, 04, 05; safe to run twice)
-- Builds on the roster_entries/shift_types tables from 01_schema.sql
-- (used since Phase 1A for duty-based login). This adds: a roster
-- builder with trainee-phase and lecture-conflict checks, publish,
-- swap/leave requests, and the full trainee induction program.
-- =====================================================================

-- ---------- reusable helper: an action open to ANY active staff member, no role or duty check ----------
-- (leave/swap requests, "which phase am I in" - things a person does about themselves)
create or replace function public.require_any_staff() returns public.staff
language plpgsql stable security definer set search_path = public as $$
declare v public.staff;
begin
  select * into v from public.staff where user_id = auth.uid() and active;
  if not found then raise exception 'Not a staff member' using errcode = '42501'; end if;
  return v;
end $$;
revoke execute on function public.require_any_staff() from public, anon;
grant execute on function public.require_any_staff() to authenticated;

-- =====================================================================
-- TRAINEE PROGRAMS
-- =====================================================================

create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  name text not null,
  total_weeks integer not null check (total_weeks between 1 and 260),
  created_at timestamptz not null default now()
);

create table if not exists public.program_phases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id),
  facility_id uuid not null references public.facilities(id),
  phase_number integer not null,
  name text not null,
  start_week integer not null,
  end_week integer not null,
  mornings_only boolean not null default false,
  supernumerary boolean not null default false,
  unique (program_id, phase_number),
  check (end_week >= start_week)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  program_id uuid not null references public.training_programs(id),
  start_date date not null,
  enrolled_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  unique (staff_id, program_id)
);

create table if not exists public.lecture_sessions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  program_id uuid not null references public.training_programs(id),
  trainer_id uuid not null references public.staff(id),
  topic text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  created_at timestamptz not null default now()
);

create table if not exists public.lecture_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lecture_sessions(id),
  staff_id uuid not null references public.staff(id),
  status text not null default 'present' check (status in ('present','absent','excused')),
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null default now(),
  unique (session_id, staff_id)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  program_id uuid not null references public.training_programs(id),
  staff_id uuid not null references public.staff(id),
  assessment_type text not null check (assessment_type in ('after_lectures','intermediate','final_exam')),
  scheduled_at timestamptz not null default now(),
  score numeric(5,1) not null,
  max_score numeric(5,1) not null default 100,
  passed boolean not null,
  note text,
  recorded_by uuid not null references public.staff(id),
  recorded_at timestamptz not null default now(),
  check (score >= 0 and score <= max_score)
);

grant select, insert, update, delete on
  public.training_programs, public.program_phases, public.enrollments,
  public.lecture_sessions, public.lecture_attendance, public.assessments
  to authenticated;
revoke insert, update, delete on public.enrollments        from authenticated;
revoke insert, update, delete on public.lecture_sessions    from authenticated;
revoke insert, update, delete on public.lecture_attendance  from authenticated;
revoke insert, update, delete on public.assessments         from authenticated;
-- programs/phases are simple facility setup, managed directly (like wards) by admin/head nurse

-- current phase for a staff member "today" (or null if not enrolled / no matching phase)
create or replace function public.get_trainee_phase(p_staff_id uuid)
returns public.program_phases
language sql stable security definer set search_path = public as $$
  select ph.*
  from public.enrollments e
  join public.program_phases ph on ph.program_id = e.program_id
  where e.staff_id = p_staff_id
    and floor((current_date - e.start_date) / 7) + 1 between ph.start_week and ph.end_week
  order by e.start_date desc
  limit 1
$$;
revoke execute on function public.get_trainee_phase(uuid) from public, anon;
grant execute on function public.get_trainee_phase(uuid) to authenticated;

create or replace function public.enroll_trainee(p_staff_id uuid, p_program_id uuid, p_start_date date)
returns public.enrollments
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.enrollments;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);

  perform 1 from public.staff where id = p_staff_id and facility_id = v_staff.facility_id and active;
  if not found then raise exception 'Trainee not found at your facility'; end if;
  perform 1 from public.training_programs where id = p_program_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Program not found'; end if;

  insert into public.enrollments (facility_id, staff_id, program_id, start_date, enrolled_by)
  values (v_staff.facility_id, p_staff_id, p_program_id, p_start_date, v_staff.id)
  on conflict (staff_id, program_id) do update set start_date = excluded.start_date
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.schedule_lecture(
  p_program_id uuid, p_topic text, p_scheduled_at timestamptz, p_duration_minutes integer default 60,
  p_id uuid default gen_random_uuid()
) returns public.lecture_sessions
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.lecture_sessions;
begin
  v_staff := public.require_admin_staff(array['trainer','admin','head_nurse']);

  select * into v_row from public.lecture_sessions where id = p_id and facility_id = v_staff.facility_id;
  if found then return v_row; end if;

  if length(trim(coalesce(p_topic,''))) < 2 then raise exception 'Enter a topic'; end if;
  perform 1 from public.training_programs where id = p_program_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Program not found'; end if;

  insert into public.lecture_sessions (id, facility_id, program_id, trainer_id, topic, scheduled_at, duration_minutes)
  values (p_id, v_staff.facility_id, p_program_id, v_staff.id, trim(p_topic), p_scheduled_at, p_duration_minutes)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.record_attendance(p_session_id uuid, p_staff_id uuid, p_status text)
returns public.lecture_attendance
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.lecture_attendance;
begin
  v_staff := public.require_admin_staff(array['trainer','admin','head_nurse']);
  if p_status not in ('present','absent','excused') then raise exception 'Invalid status'; end if;

  perform 1 from public.lecture_sessions where id = p_session_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Lecture not found'; end if;

  insert into public.lecture_attendance (session_id, staff_id, status, recorded_by)
  values (p_session_id, p_staff_id, p_status, v_staff.id)
  on conflict (session_id, staff_id) do update set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.record_assessment(
  p_program_id uuid, p_staff_id uuid, p_assessment_type text, p_score numeric, p_max_score numeric,
  p_note text default null
) returns public.assessments
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.assessments;
begin
  v_staff := public.require_admin_staff(array['trainer','admin','head_nurse']);
  if p_assessment_type not in ('after_lectures','intermediate','final_exam') then raise exception 'Invalid assessment type'; end if;
  if p_score is null or p_max_score is null or p_score < 0 or p_score > p_max_score then
    raise exception 'Score must be between 0 and the maximum';
  end if;

  insert into public.assessments (facility_id, program_id, staff_id, assessment_type, score, max_score, passed, note, recorded_by)
  values (v_staff.facility_id, p_program_id, p_staff_id, p_assessment_type, p_score, p_max_score,
    p_score >= (p_max_score * 0.5), nullif(trim(coalesce(p_note,'')),''), v_staff.id)
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.enroll_trainee(uuid, uuid, date) from public, anon;
revoke execute on function public.schedule_lecture(uuid, text, timestamptz, integer, uuid) from public, anon;
revoke execute on function public.record_attendance(uuid, uuid, text) from public, anon;
revoke execute on function public.record_assessment(uuid, uuid, text, numeric, numeric, text) from public, anon;
grant execute on function public.enroll_trainee(uuid, uuid, date) to authenticated;
grant execute on function public.schedule_lecture(uuid, text, timestamptz, integer, uuid) to authenticated;
grant execute on function public.record_attendance(uuid, uuid, text) to authenticated;
grant execute on function public.record_assessment(uuid, uuid, text, numeric, numeric, text) to authenticated;

alter table public.training_programs  enable row level security;
alter table public.program_phases     enable row level security;
alter table public.enrollments        enable row level security;
alter table public.lecture_sessions   enable row level security;
alter table public.lecture_attendance enable row level security;
alter table public.assessments        enable row level security;

drop policy if exists programs_read on public.training_programs;
create policy programs_read on public.training_programs for select to authenticated using (facility_id = public.current_facility_id());
drop policy if exists programs_admin on public.training_programs;
create policy programs_admin on public.training_programs for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));

drop policy if exists phases_read on public.program_phases;
create policy phases_read on public.program_phases for select to authenticated using (facility_id = public.current_facility_id());
drop policy if exists phases_admin on public.program_phases;
create policy phases_admin on public.program_phases for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));

drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select to authenticated using (facility_id = public.current_facility_id());
drop policy if exists sessions_read on public.lecture_sessions;
create policy sessions_read on public.lecture_sessions for select to authenticated using (facility_id = public.current_facility_id());

-- attendance and scores are a bit more sensitive: the trainee themselves, or admin/head nurse/trainer
drop policy if exists attendance_read on public.lecture_attendance;
create policy attendance_read on public.lecture_attendance for select to authenticated using (
  staff_id = public.current_staff_id()
  or exists (select 1 from public.lecture_sessions s where s.id = session_id and s.facility_id = public.current_facility_id()
             and public.has_role(array['admin','head_nurse','trainer']))
);
drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated using (
  staff_id = public.current_staff_id()
  or (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse','trainer']))
);

-- =====================================================================
-- ROSTER BUILDER (uses roster_entries / shift_types from 01_schema.sql)
-- =====================================================================

-- writes now go only through upsert_roster_entry, so trainee-phase and lecture-conflict rules
-- are always enforced, not just when someone remembers to check.
revoke insert, update on public.roster_entries from authenticated;

create or replace function public.upsert_roster_entry(
  p_staff_id uuid, p_work_date date, p_shift_type_id uuid, p_ward_id uuid default null,
  p_id uuid default gen_random_uuid()
) returns public.roster_entries
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_target public.staff; v_shift public.shift_types; v_phase public.program_phases;
  v_row public.roster_entries; v_conflict record; v_tz text; v_shift_start timestamp; v_shift_end timestamp;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);

  select * into v_target from public.staff where id = p_staff_id and facility_id = v_staff.facility_id and active;
  if not found then raise exception 'Staff member not found at your facility'; end if;

  select * into v_shift from public.shift_types where id = p_shift_type_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Shift type not found'; end if;

  if p_ward_id is not null then
    perform 1 from public.wards where id = p_ward_id and facility_id = v_staff.facility_id;
    if not found then raise exception 'Ward not found'; end if;
  end if;

  -- trainee-phase rule: a mornings-only/supernumerary phase can only take the "morning" shift
  v_phase := public.get_trainee_phase(p_staff_id);
  if v_phase.mornings_only and v_shift.code <> 'morning' then
    raise exception 'This trainee is in phase "%": mornings only. Choose the morning shift.', v_phase.name;
  end if;

  -- lecture-conflict rule: cannot roster a trainee onto a shift that overlaps their own lecture.
  -- Everything is compared as facility-LOCAL naive time (same approach as is_on_duty), which avoids
  -- mixing a plain clock time (shift_types.start_time has no time zone of its own) with an absolute
  -- instant (lecture_sessions.scheduled_at) the wrong way.
  if v_shift.start_time is not null then
    select f.timezone into v_tz from public.facilities f where f.id = v_staff.facility_id;
    v_shift_start := p_work_date + v_shift.start_time;
    v_shift_end := p_work_date + v_shift.start_time
      + case when v_shift.end_time > v_shift.start_time then (v_shift.end_time - v_shift.start_time)
             else (v_shift.end_time - v_shift.start_time) + interval '24 hours' end;

    select l.topic, l.scheduled_at into v_conflict
    from public.enrollments e
    join public.lecture_sessions l on l.program_id = e.program_id and l.facility_id = v_staff.facility_id
    where e.staff_id = p_staff_id
      and (v_shift_start, v_shift_end)
          overlaps ((l.scheduled_at at time zone v_tz), (l.scheduled_at at time zone v_tz) + (l.duration_minutes || ' minutes')::interval)
    limit 1;
    if found then
      raise exception 'This trainee has a lecture ("%") at that time. Choose a different shift or date.', v_conflict.topic;
    end if;
  end if;

  insert into public.roster_entries (id, facility_id, staff_id, ward_id, shift_type_id, work_date, status, created_by)
  values (p_id, v_staff.facility_id, p_staff_id, p_ward_id, p_shift_type_id, p_work_date, 'draft', v_staff.id)
  on conflict (staff_id, work_date, shift_type_id) do update
    set ward_id = excluded.ward_id
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.publish_roster_entry(p_id uuid) returns public.roster_entries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.roster_entries;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);

  select * into v_row from public.roster_entries where id = p_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Roster entry not found'; end if;
  if v_row.status = 'published' then return v_row; end if;

  update public.roster_entries set status = 'published' where id = p_id returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.upsert_roster_entry(uuid, date, uuid, uuid, uuid) from public, anon;
revoke execute on function public.publish_roster_entry(uuid) from public, anon;
grant execute on function public.upsert_roster_entry(uuid, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.publish_roster_entry(uuid) to authenticated;

-- ---------- SWAP / LEAVE REQUESTS ----------
create table if not exists public.roster_requests (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  roster_entry_id uuid not null references public.roster_entries(id),
  request_type text not null check (request_type in ('leave','cover')),
  cover_staff_id uuid references public.staff(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by uuid references public.staff(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (request_type <> 'cover' or cover_staff_id is not null)
);

grant select, insert, update, delete on public.roster_requests to authenticated;
revoke insert, update, delete on public.roster_requests from authenticated;

create or replace function public.request_roster_change(
  p_roster_entry_id uuid, p_request_type text, p_reason text, p_cover_staff_id uuid default null
) returns public.roster_requests
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_entry public.roster_entries; v_row public.roster_requests;
begin
  v_staff := public.require_any_staff();
  if p_request_type not in ('leave','cover') then raise exception 'Invalid request type'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason'; end if;
  if p_request_type = 'cover' and p_cover_staff_id is null then raise exception 'Choose who will cover'; end if;

  select * into v_entry from public.roster_entries where id = p_roster_entry_id;
  if not found or v_entry.staff_id <> v_staff.id then raise exception 'That is not one of your shifts'; end if;
  if v_entry.status <> 'published' then raise exception 'Only a published shift can be changed'; end if;

  insert into public.roster_requests (facility_id, staff_id, roster_entry_id, request_type, cover_staff_id, reason)
  values (v_staff.facility_id, v_staff.id, p_roster_entry_id, p_request_type, p_cover_staff_id, trim(p_reason))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.decide_roster_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.roster_requests
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_req public.roster_requests; v_off_shift uuid;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);

  select * into v_req from public.roster_requests where id = p_request_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'pending' then return v_req; end if;

  if p_approve then
    if v_req.request_type = 'leave' then
      select id into v_off_shift from public.shift_types where facility_id = v_staff.facility_id and code = 'off';
      if v_off_shift is null then raise exception 'No "off" shift type is set up for this facility'; end if;
      update public.roster_entries set shift_type_id = v_off_shift where id = v_req.roster_entry_id;
    else
      if exists (select 1 from public.roster_entries r
                 where r.staff_id = v_req.cover_staff_id
                   and r.work_date = (select work_date from public.roster_entries where id = v_req.roster_entry_id)
                   and r.shift_type_id = (select shift_type_id from public.roster_entries where id = v_req.roster_entry_id)) then
        raise exception 'The covering staff member already has a shift that day';
      end if;
      update public.roster_entries set staff_id = v_req.cover_staff_id where id = v_req.roster_entry_id;
    end if;
  end if;

  update public.roster_requests set
    status = case when p_approve then 'approved' else 'denied' end,
    decided_by = v_staff.id, decided_at = now(), decision_note = nullif(trim(coalesce(p_note,'')),'')
  where id = p_request_id
  returning * into v_req;
  return v_req;
end $$;

revoke execute on function public.request_roster_change(uuid, text, text, uuid) from public, anon;
revoke execute on function public.decide_roster_request(uuid, boolean, text) from public, anon;
grant execute on function public.request_roster_change(uuid, text, text, uuid) to authenticated;
grant execute on function public.decide_roster_request(uuid, boolean, text) to authenticated;

alter table public.roster_requests enable row level security;
drop policy if exists roster_requests_read on public.roster_requests;
create policy roster_requests_read on public.roster_requests for select to authenticated using (
  staff_id = public.current_staff_id()
  or (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
);

-- ---------- seed: one standard 15-month induction program ----------
-- (no unique constraint on the program's name, so a plain ON CONFLICT can't de-duplicate it;
-- guard with NOT EXISTS instead so re-running this file never creates a second copy)
insert into public.training_programs (facility_id, name, total_weeks)
select f.id, 'Nursing Induction Program', 65
from public.facilities f
where f.type = 'hospital'
  and not exists (
    select 1 from public.training_programs p
    where p.facility_id = f.id and p.name = 'Nursing Induction Program'
  );

insert into public.program_phases (program_id, facility_id, phase_number, name, start_week, end_week, mornings_only, supernumerary)
select p.id, p.facility_id, v.n, v.name, v.sw, v.ew, v.mo, v.sn
from public.training_programs p
cross join (values
  (1, 'Supernumerary orientation', 1, 16, true, true),
  (2, 'Supervised rotation',       17, 65, false, false)
) as v(n, name, sw, ew, mo, sn)
where p.name = 'Nursing Induction Program'
on conflict (program_id, phase_number) do nothing;
