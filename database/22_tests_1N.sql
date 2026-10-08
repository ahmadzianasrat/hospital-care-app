-- =====================================================================
-- 22: TESTS FOR STEP 1N (roster automation + ward staffing). Run each
-- block SEPARATELY. Everything is rolled back at the end. Uses fixed
-- 2026 dates so results don't depend on when you run this.
-- =====================================================================

-- TEST AF: the rotation continues correctly from a known prior-month shift (sleep -> off, morning,
-- night, sleep, off, morning), and a nurse with no history defaults to starting at morning.
-- Expect Ahmad: off, morning, night, sleep, off, morning. Expect Zara (no history): morning, night, sleep, off.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;

select public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Ahmad (demo)'), '2026-09-30',
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'sleep'),
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));

select public.generate_month_roster(
  (select id from public.staff where full_name = 'Nurse Ahmad (demo)'), 2026, 10,
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));

select to_char(r.work_date, 'MM-DD') as day, st.code
from public.roster_entries r join public.shift_types st on st.id = r.shift_type_id
where r.staff_id = (select id from public.staff where full_name = 'Nurse Ahmad (demo)')
  and r.work_date between '2026-10-01' and '2026-10-06'
order by r.work_date;
rollback;

-- TEST AG: a manual change after generation takes effect immediately (the "easily changeable later"
-- requirement) - expect the day shows "paid_leave" after this, not the cycle shift it started as.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select public.generate_month_roster(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'), 2026, 10,
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));
select st.code from public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'), '2026-10-03',
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'paid_leave'), null
) r join public.shift_types st on st.id = r.shift_type_id;
rollback;

-- TEST AH: only admin/head nurse can generate a month or set a staffing requirement.
-- Expect the same error both times: "No access: your role cannot do this"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select public.generate_month_roster((select id from public.staff limit 1), 2026, 10, null);
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select public.set_ward_staffing_requirement(
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'),
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'), 5);
rollback;

-- TEST AI: the ward staffing overview correctly flags an understaffed shift.
-- Expect one row: assigned = 1, required = 2.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;

select public.generate_month_roster(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'), 2026, 10,
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));
select public.set_ward_staffing_requirement(
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'),
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'), 2);
select public.publish_roster_entry(
  (select id from public.roster_entries where staff_id = (select id from public.staff where full_name = 'Nurse Zara (demo)')
    and work_date = '2026-10-01' and shift_type_id = (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning')));

select ward_name, assigned, required from public.ward_staffing_overview('2026-10-01', '2026-10-01')
where shift_name ilike 'morning';
rollback;

-- TEST AJ: a Kabul account cannot see Helmand's staffing requirements. Expect 0.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as kb_sees_hl_requirements from public.ward_staffing_requirements
where facility_id = (select id from public.facilities where code = 'HL');
rollback;
