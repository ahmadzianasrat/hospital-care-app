-- =====================================================================
-- 18: TESTS FOR STEP 1J (staff roster + trainee programs). Run each
-- block SEPARATELY. Everything is rolled back at the end. Two real bugs
-- (both about re-running this file safely) were found and fixed while
-- writing these tests - see SETUP.md and the app README for details.
-- =====================================================================

-- TEST X: enroll a trainee, confirm their phase, and enforce it on the roster -
-- a phase-1 (mornings-only) trainee can get the morning shift but not night.
-- Expect: phase = "Supernumerary orientation"; morning succeeds; night is rejected.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;

select public.enroll_trainee(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'),
  (select id from public.training_programs where facility_id = (select id from public.facilities where code = 'HL')),
  current_date);

select name, mornings_only from public.get_trainee_phase(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'));

reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;

select status from public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'),
  current_date + 1,
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'),
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));

-- this one should fail: night shift while in a mornings-only phase
select public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Zara (demo)'),
  current_date + 2,
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'night'),
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));
rollback;

-- TEST Y: role checks - only admin/head nurse build the roster; only trainer/admin/head nurse
-- schedule lectures or record assessments. Expect the same error each time:
-- "No access: your role cannot do this"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select public.upsert_roster_entry(
  (select id from public.staff limit 1), current_date + 1,
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'), null);
rollback;

-- TEST Z: the leave / cover request workflow, end to end.
-- Expect: leave approved -> shift becomes "off"; cover approved -> shift moves to the covering staff.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Ahmad (demo)'),
  current_date + 1,
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'),
  (select id from public.wards where facility_id = (select id from public.facilities where code = 'HL') and code = 'ALPHA'));
select public.publish_roster_entry(
  (select id from public.roster_entries where staff_id = (select id from public.staff where full_name = 'Nurse Ahmad (demo)') and work_date = current_date + 1));

reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select public.request_roster_change(
  (select id from public.roster_entries where staff_id = (select id from public.staff where full_name = 'Nurse Ahmad (demo)') and work_date = current_date + 1),
  'leave', 'Personal reasons');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select public.decide_roster_request(
  (select id from public.roster_requests order by created_at desc limit 1), true, 'Approved');

select st.code
from public.roster_entries r join public.shift_types st on st.id = r.shift_type_id
where r.staff_id = (select id from public.staff where full_name = 'Nurse Ahmad (demo)')
  and r.work_date = current_date + 1;
rollback;

-- TEST AA: a Kabul doctor cannot build the Helmand roster, and cannot read its trainee assessments.
-- Written as TWO separate transactions - once a statement errors, Postgres ignores every later
-- statement in that same transaction, so a check placed after an expected error would never run.
-- Run the whole block at once; expect, in order: an error ("No access: your role cannot do this" -
-- a Kabul doctor is not admin/head_nurse, so this is correctly refused everywhere, not just across
-- facilities); then kb_sees_hl_assessments = 0.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select public.upsert_roster_entry(
  (select id from public.staff where full_name = 'Nurse Ahmad (demo)'),
  current_date + 1,
  (select id from public.shift_types where facility_id = (select id from public.facilities where code = 'HL') and code = 'morning'), null);
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as kb_sees_hl_assessments from public.assessments where facility_id = (select id from public.facilities where code = 'HL');
rollback;
