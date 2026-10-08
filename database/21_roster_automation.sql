-- =====================================================================
-- 21: STEP 1N - ROSTER AUTOMATION + LEAVE TYPES + WARD STAFFING
-- (run AFTER 01, 02, 04, 05, 17; safe to run twice)
-- =====================================================================

-- A rotation_order marks the four shift types that make up the repeating work cycle
-- (Morning -> Night -> Sleep -> Off -> repeat). Leave types (paid leave, unpaid leave, etc.)
-- have no rotation_order, since the auto-generator never assigns them on its own - a head nurse
-- places them by hand afterward, same as any other manual roster change.
alter table public.shift_types add column if not exists rotation_order integer;
alter table public.shift_types drop constraint if exists shift_types_rotation_order_range;
alter table public.shift_types add constraint shift_types_rotation_order_range
  check (rotation_order is null or rotation_order between 1 and 4);
create unique index if not exists shift_types_one_per_rotation_slot
  on public.shift_types (facility_id, rotation_order) where rotation_order is not null;

-- add "sleep" (the mandatory post-night rest day) and set the rotation order on the four cycle shifts
insert into public.shift_types (facility_id, code, name, start_time, end_time, counts_as_duty)
select f.id, 'sleep', 'Sleep (post-night rest)', null, null, false
from public.facilities f
where not exists (select 1 from public.shift_types st where st.facility_id = f.id and st.code = 'sleep');

update public.shift_types set rotation_order = 1 where code = 'morning' and rotation_order is null;
update public.shift_types set rotation_order = 2 where code = 'night'   and rotation_order is null;
update public.shift_types set rotation_order = 3 where code = 'sleep'  and rotation_order is null;
update public.shift_types set rotation_order = 4 where code = 'off'    and rotation_order is null;

-- leave types: every facility gets the same five, all non-duty
insert into public.shift_types (facility_id, code, name, start_time, end_time, counts_as_duty)
select f.id, v.code, v.name, null, null, false
from public.facilities f
cross join (values
  ('paid_leave',       'Paid leave'),
  ('unpaid_leave',     'Unpaid leave'),
  ('maternity_leave',  'Maternity leave'),
  ('national_holiday', 'National holiday'),
  ('study_leave',      'Study leave')
) as v(code, name)
where not exists (select 1 from public.shift_types st where st.facility_id = f.id and st.code = v.code);

-- ---------- AUTO-GENERATE A MONTH'S ROSTER FROM THE M -> N -> S -> O CYCLE ----------
-- Continues each staff member's own cycle from wherever their last cycle shift left off (so if they
-- were "sleep" on the last day of the previous month, next month correctly starts "off, morning,
-- night, sleep, off, ..."). p_start_code lets the head nurse pick an explicit starting point instead
-- (e.g. for someone with no roster history yet); otherwise it looks one back automatically.
create or replace function public.generate_month_roster(
  p_staff_id uuid, p_year integer, p_month integer, p_ward_id uuid default null, p_start_code text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_month_start date; v_days integer; v_cycle text[4];
  v_last_order integer; v_day integer; v_order integer; v_shift_id uuid; v_count integer := 0;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  v_month_start := make_date(p_year, p_month, 1);
  v_days := extract(day from (v_month_start + interval '1 month' - interval '1 day'))::integer;

  -- the four shift ids in cycle order (1=morning, 2=night, 3=sleep, 4=off), for this facility
  select array_agg(id order by rotation_order) into v_cycle
  from public.shift_types where facility_id = v_staff.facility_id and rotation_order is not null;
  if array_length(v_cycle, 1) <> 4 then
    raise exception 'This facility does not have the four cycle shifts (morning/night/sleep/off) set up';
  end if;

  if p_start_code is not null then
    select rotation_order into v_last_order from public.shift_types
      where facility_id = v_staff.facility_id and code = p_start_code;
    if v_last_order is null then raise exception 'Unknown starting shift code: %', p_start_code; end if;
    v_last_order := v_last_order - 1; -- so day 1 of the month lands exactly on the requested shift
  else
    -- the most recent cycle shift this person had, on or before the day before this month starts
    select st.rotation_order into v_last_order
    from public.roster_entries r join public.shift_types st on st.id = r.shift_type_id
    where r.staff_id = p_staff_id and st.rotation_order is not null and r.work_date < v_month_start
    order by r.work_date desc limit 1;
    if v_last_order is null then v_last_order := 0; end if; -- no history: start the cycle at Morning
  end if;

  for v_day in 0 .. v_days - 1 loop
    v_order := ((v_last_order + v_day) % 4) + 1;
    v_shift_id := v_cycle[v_order];
    perform public.upsert_roster_entry(p_staff_id, v_month_start + v_day, v_shift_id, p_ward_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.generate_month_roster(uuid, integer, integer, uuid, text) from public, anon;
grant execute on function public.generate_month_roster(uuid, integer, integer, uuid, text) to authenticated;

-- ---------- WARD STAFFING REQUIREMENTS ----------
create table if not exists public.ward_staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  ward_id uuid not null references public.wards(id),
  shift_type_id uuid not null references public.shift_types(id),
  min_staff integer not null check (min_staff >= 0),
  unique (ward_id, shift_type_id)
);

grant select, insert, update, delete on public.ward_staffing_requirements to authenticated;
revoke insert, update, delete on public.ward_staffing_requirements from authenticated;

create or replace function public.set_ward_staffing_requirement(p_ward_id uuid, p_shift_type_id uuid, p_min_staff integer)
returns public.ward_staffing_requirements
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.ward_staffing_requirements;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  perform 1 from public.wards w where w.id = p_ward_id and w.facility_id = v_staff.facility_id;
  if not found then raise exception 'Ward not found'; end if;
  perform 1 from public.shift_types st where st.id = p_shift_type_id and st.facility_id = v_staff.facility_id;
  if not found then raise exception 'Shift type not found'; end if;

  insert into public.ward_staffing_requirements (facility_id, ward_id, shift_type_id, min_staff)
  values (v_staff.facility_id, p_ward_id, p_shift_type_id, p_min_staff)
  on conflict (ward_id, shift_type_id) do update set min_staff = excluded.min_staff
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.set_ward_staffing_requirement(uuid, uuid, integer) from public, anon;
grant execute on function public.set_ward_staffing_requirement(uuid, uuid, integer) to authenticated;

alter table public.ward_staffing_requirements enable row level security;
drop policy if exists staffing_req_read on public.ward_staffing_requirements;
create policy staffing_req_read on public.ward_staffing_requirements for select to authenticated using (facility_id = public.current_facility_id());

-- a day/ward/shift staffing count, for the roster overview screen: how many are rostered vs required
create or replace function public.ward_staffing_overview(p_from date, p_to date)
returns table (ward_name text, work_date date, shift_name text, assigned integer, required integer)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  return query
  select w.name, d.work_date::date, st.name,
    (select count(*)::integer from public.roster_entries r
       where r.ward_id = w.id and r.shift_type_id = st.id and r.work_date = d.work_date::date
         and r.status = 'published' and st.counts_as_duty),
    req.min_staff
  from public.ward_staffing_requirements req
  join public.wards w on w.id = req.ward_id
  join public.shift_types st on st.id = req.shift_type_id
  -- generate_series(date, date, interval) has no such overload in Postgres; it silently promotes the
  -- dates to timestamp, so the result column must be cast back to date explicitly.
  cross join lateral generate_series(p_from, p_to, interval '1 day') as d(work_date)
  where req.facility_id = v_staff.facility_id
  order by w.name, d.work_date::date, st.name;
end $$;

revoke execute on function public.ward_staffing_overview(date, date) from public, anon;
grant execute on function public.ward_staffing_overview(date, date) to authenticated;
