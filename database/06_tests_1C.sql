-- =====================================================================
-- 06: TESTS FOR STEP 1C. Run each block SEPARATELY (select it, then Run).
-- Everything is rolled back at the end, so no data is left behind.
-- =====================================================================

-- TEST A: full visit as the on-call doctor: start visit > triage > OPD > discharge.
-- Expect: status = discharged, documents = 2
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90001HL'));
select public.complete_triage(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90001HL') order by created_at desc limit 1),
  'red', 'opd', '{"injury_description":"test injury","vitals":{"hr":100}}'::jsonb);
select public.claim_opd(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90001HL') order by created_at desc limit 1));
select public.complete_opd(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90001HL') order by created_at desc limit 1),
  'discharge', '{"diagnosis":"Test diagnosis"}'::jsonb);
select e.status, (select count(*) from public.documents d where d.encounter_id = e.id) as documents
from public.encounters e
where e.patient_id = (select id from public.patients where display_id = '90001HL')
order by e.created_at desc limit 1;
rollback;

-- TEST B: Nurse Zara has no shift, so she cannot start a visit.
-- Expect an error: "No access: you are off duty or your role cannot do this"
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90001HL'));
rollback;

-- TEST C: two doctors cannot take the same patient.
-- Expect an error: "Another doctor is already seeing this patient"
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  'yellow', 'opd', '{"injury_description":"test"}'::jsonb);
select public.claim_opd(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1));
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select public.claim_opd(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1));
rollback;

-- TEST D: the Kabul doctor cannot touch a Helmand visit (expect an error: "Visit not found").
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90003HL'));
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select public.claim_opd(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90003HL') order by created_at desc limit 1));
rollback;
