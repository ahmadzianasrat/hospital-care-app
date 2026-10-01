-- =====================================================================
-- 12: TESTS FOR STEP 1G. Run each block SEPARATELY (select it, then Run).
-- Everything is rolled back at the end. Uses "doctor@demo.test" (on call
-- all day) throughout so results do not depend on what time you run this.
-- =====================================================================

-- TEST L: a full nursing-chart round: vitals, circulation, fluids, Barthel, notes.
-- Expect: gcs=15, balance_ml=200, barthel_total=55, both notes saved.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;

select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"fracture"}'::jsonb);
select public.claim_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'admit', '{"diagnosis":"Femur fracture"}'::jsonb);

select public.record_observation(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  120, 80, 88, 18, 98, 37.0, 4, 5, 6, 'reactive', 'reactive', null);
select public.record_circulation_check(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  'Left leg', 'normal', 'normal', 2.0, 'warm', 'normal', false, false, null);
select public.record_fluid_event((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'iv_fluid', 500, 'NS');
select public.record_fluid_event((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'urine', 300, null);
select public.record_barthel(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  '{"feeding":10,"bathing":5,"grooming":5,"dressing":10,"bowels":10,"bladder":10,"toilet":5,"transfer":0,"mobility":0,"stairs":0}'::jsonb);
select public.add_care_note((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'nursing_note', 'Comfortable overnight');
select public.add_care_note((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'physio_note', 'Started chest physio');

select
  (select gcs_e + gcs_v + gcs_m from public.observations where encounter_id = e.id limit 1) as gcs,
  (select balance_ml from public.fluid_balance(e.id)) as balance_ml,
  (select total_score from public.barthel_assessments where encounter_id = e.id limit 1) as barthel_total,
  (select count(*) from public.documents where encounter_id = e.id and doc_type in ('nursing_note','physio_note')) as notes
from public.encounters e
where e.patient_id = (select id from public.patients where display_id = '90002HL')
order by e.created_at desc limit 1;
rollback;

-- TEST M: only a physio (or doctor/chief surgeon) may record a Barthel score.
-- Expect an error: "No access: you are off duty or your role cannot do this"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
-- head_nurse IS allowed by design (helps cover when no physio is on shift), so this uses a role that
-- is genuinely blocked: a plain nurse cannot record it (nurse.ahmad, whether on shift or not).
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select public.record_barthel((select id from public.encounters limit 1), '{"feeding":10}'::jsonb);
rollback;

-- TEST N: a nurse cannot write a physio note (expect the same "No access" error).
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select public.add_care_note((select id from public.encounters limit 1), 'physio_note', 'test');
rollback;

-- TEST O: facility isolation still holds for every chart. Expect: kb_sees = 0, chief_sees > 0.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as kb_sees from public.observations where facility_id = (select id from public.facilities where code = 'HL');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select count(*) as chief_sees from public.observations;
rollback;
