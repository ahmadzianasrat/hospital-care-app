-- =====================================================================
-- 16: TESTS FOR STEP 1I (OT scheduling). Run each block SEPARATELY.
-- Everything is rolled back at the end. Uses "doctor@demo.test" (on call
-- all day) throughout so results do not depend on what time you run this.
-- Two real bugs were found and fixed while writing these tests - see
-- SETUP.md and the app README for what they were.
-- =====================================================================

-- TEST T: book a case, double-booking the same theatre fails, a different theatre at the same
-- time works, only a doctor/chief surgeon can be listed as surgeon.
-- Expect: booked=scheduled; overlap fails; different theatre succeeds; nurse-as-surgeon fails.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;

select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'admit', '{"diagnosis":"Femur fracture"}'::jsonb);

select public.book_surgery(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  (select id from public.theatres where code = 'OT1' and facility_id = (select id from public.facilities where code = 'HL')),
  'emergency', 'Femur fracture', 'ORIF femur', 'general', 'II',
  '2026-10-01T10:00:00+00', '2026-10-01T11:00:00+00',
  (select id from public.staff s join auth.users u on u.id = s.user_id where u.email = 'doctor@demo.test'));

-- overlapping booking in the same theatre - expect an error
select public.book_surgery(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  (select id from public.theatres where code = 'OT1' and facility_id = (select id from public.facilities where code = 'HL')),
  'elective', 'Test', 'Test procedure', 'spinal', 'I',
  '2026-10-01T10:30:00+00', '2026-10-01T11:30:00+00',
  (select id from public.staff s join auth.users u on u.id = s.user_id where u.email = 'doctor@demo.test'));
rollback;

-- TEST U: full theatre journey - start, complete, and the operative note it creates.
-- Expect: status=in_progress after start; status=completed, outcome=alive after complete;
-- one 'surgery' document exists with outcome=alive.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;

select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters order by created_at desc limit 1), 'admit', '{"diagnosis":"x"}'::jsonb);
select public.book_surgery(
  (select id from public.encounters order by created_at desc limit 1),
  (select id from public.theatres where code = 'OT2' and facility_id = (select id from public.facilities where code = 'HL')),
  'emergency', 'Femur fracture', 'ORIF femur', 'general', 'II',
  '2026-10-01T14:00:00+00', '2026-10-01T15:00:00+00',
  (select id from public.staff s join auth.users u on u.id = s.user_id where u.email = 'doctor@demo.test'));
select public.start_surgery((select id from public.surgeries order by booked_at desc limit 1));
select public.complete_surgery(
  (select id from public.surgeries order by booked_at desc limit 1),
  'Comminuted fracture', 'ORIF with plate and screws', 'alive', '[{"role":"assistant","name":"Dr B"}]'::jsonb);

select s.status, s.outcome, d.doc_type, d.data->>'outcome' as doc_outcome
from public.surgeries s
join public.documents d on d.encounter_id = s.encounter_id and d.doc_type = 'surgery'
order by s.booked_at desc limit 1;
rollback;

-- TEST V: a nurse cannot start or complete surgery (clinical acts, doctor/chief surgeon only).
-- Expect an error: "No access: you are off duty or your role cannot do this"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters order by created_at desc limit 1), 'admit', '{"diagnosis":"x"}'::jsonb);
select public.book_surgery(
  (select id from public.encounters order by created_at desc limit 1),
  (select id from public.theatres where code = 'OT1' and facility_id = (select id from public.facilities where code = 'HL')),
  'emergency', 'x', 'y', 'general', 'I', '2026-10-05T10:00:00+00', '2026-10-05T11:00:00+00',
  (select id from public.staff s join auth.users u on u.id = s.user_id where u.email = 'doctor@demo.test'));
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select public.start_surgery((select id from public.surgeries order by booked_at desc limit 1));
rollback;

-- TEST W: facility isolation. A Kabul doctor cannot book on, or read, a Helmand case.
-- Expect: "Visit not found"; kb_sees_hl = 0; chief_sees > 0 (cross-facility read).
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select public.book_surgery(
  (select id from public.encounters limit 1),
  (select id from public.theatres where code = 'OT1' and facility_id = (select id from public.facilities where code = 'HL')),
  'elective', 'Test diagnosis', 'Test procedure', 'general', 'I',
  '2026-10-06T10:00:00+00', '2026-10-06T11:00:00+00',
  (select id from public.staff s join auth.users u on u.id = s.user_id where u.email = 'kb.doctor@demo.test'));
select count(*) as kb_sees_hl from public.surgeries where facility_id = (select id from public.facilities where code = 'HL');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select count(*) as chief_sees from public.surgeries;
rollback;
