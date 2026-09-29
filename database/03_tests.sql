-- =====================================================================
-- PHASE 1A TESTS. Run each numbered block SEPARATELY (select it, then Run).
-- The editor shows only the result of the LAST statement in a block.
-- Ahmad's shift is 08:00-16:00 Kabul time. Access: 5 min before to 15 min after (07:55-16:15).
-- Run these AFTER 04_changes_1B.sql. Kabul time is UTC+4:30.
-- =====================================================================

-- TEST 1: Ahmad's status. on_duty = true only between 07:55 and 16:15 Kabul time.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select * from public.my_access_status();
rollback;

-- TEST 2: Zara has no shift. Expect on_duty = false, and 0 patients visible.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select count(*) as patients_visible from public.patients;
rollback;

-- TEST 3: Zara uses break-glass, then sees the patients (expect 3).
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select public.request_break_glass('Demo test: covering ward during emergency');
select count(*) as patients_visible_after_break_glass from public.patients;
rollback;

-- TEST 4: On-call doctor can search by the 6-digit x-ray number (expect Test Patient One).
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select display_id, full_name from public.search_patients('100001');
rollback;

-- TEST 5: Kabul doctor must NOT see Helmand patients (expect 0). He sees only his own facility.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as helmand_patients_seen_from_kabul from public.patients where facility_code = 'HL';
rollback;

-- TEST 6: Doctor registers a patient (expect a new number 90004HL). Rolled back after.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select display_id, full_name from public.register_patient('Test Patient Four', 'female', p_age_years => 22);
rollback;

-- TEST 7: Helmand on-call DOCTOR must NOT see Kabul patients (expect 0).
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select count(*) as kabul_patients_seen_by_helmand_doctor from public.patients where facility_code = 'KB';
rollback;

-- TEST 8: Helmand CHIEF SURGEON may read across facilities (expect 4 rows: 3 HL + 1 KB).
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select display_id, full_name from public.patients order by display_id;
rollback;

-- TEST 9: the head nurse can read across facilities too.
-- (Expect 4 rows.)
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select count(*) as patients_visible from public.patients;
rollback;
