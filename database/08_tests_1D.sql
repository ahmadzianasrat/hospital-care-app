-- =====================================================================
-- 08: TESTS FOR STEP 1D. Run each block SEPARATELY (select it, then Run).
-- Everything is rolled back at the end.
-- =====================================================================

-- TEST E: the whole referral journey, first aid post (FAP) to Kabul.
-- Expect one row: status = arrived, sender = FA, sees_name = Test FAP Patient, treatments = 0
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'fap.nurse@demo.test';
set local role authenticated;
select public.register_patient('Test FAP Patient', 'female', p_age_years => 30, p_allergy_status => 'none');
select public.start_visit((select id from public.patients where full_name = 'Test FAP Patient'));
select public.complete_triage(
  (select id from public.encounters order by created_at desc limit 1),
  'red', 'refer', '{"injury_description":"blast injury","vitals":{"hr":120,"bp_sys":90}}'::jsonb);
select public.create_referral(
  (select id from public.encounters order by created_at desc limit 1),
  (select id from public.facilities where code = 'KB'), null,
  'Needs surgery', now() + interval '2 hours', 'IV line, dressing', 'ambulance');
-- Kabul doctor receives it and registers the patient
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select public.register_patient('Test FAP Patient', 'female', p_age_years => 30);
select public.link_referral_arrival(
  (select id from public.referrals order by created_at desc limit 1),
  (select id from public.patients where full_name = 'Test FAP Patient' and facility_code = 'KB'));
select r.status,
       r.payload->'from'->>'facility_code' as sender,
       r.payload->'patient'->>'full_name' as sees_name,
       jsonb_array_length(r.payload->'treatments') as treatments
from public.referrals r order by r.created_at desc limit 1;
rollback;

-- TEST F: a Helmand doctor is NOT involved in a FAP-to-Kabul referral, so must not see it. Expect count = 0
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'fap.nurse@demo.test';
set local role authenticated;
select public.register_patient('Test FAP Patient 2', 'male', p_age_years => 40);
select public.start_visit((select id from public.patients where full_name = 'Test FAP Patient 2'));
select public.complete_triage(
  (select id from public.encounters order by created_at desc limit 1),
  'orange', 'refer', '{"injury_description":"test"}'::jsonb);
select public.create_referral(
  (select id from public.encounters order by created_at desc limit 1),
  (select id from public.facilities where code = 'KB'), null, 'Needs specialist', null, '');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select count(*) as referrals_seen_by_helmand_doctor from public.referrals;
rollback;

-- TEST G: quick treatment works while the patient is in OPD, and is refused after the visit ends.
-- Expect an error: "Treatments can only be added while the patient is in OPD (status: discharged)"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90001HL'));
select public.complete_triage(
  (select id from public.encounters order by created_at desc limit 1),
  'green', 'opd', '{"injury_description":"minor cut"}'::jsonb);
select public.claim_opd((select id from public.encounters order by created_at desc limit 1));
select public.add_quick_treatment(
  (select id from public.encounters order by created_at desc limit 1),
  '{"procedure":"Wound dressing","drug":"Tetanus vaccine","dose":"0.5 ml","route":"IM"}'::jsonb);
select public.complete_opd(
  (select id from public.encounters order by created_at desc limit 1),
  'discharge', '{"diagnosis":"Minor laceration"}'::jsonb);
select public.add_quick_treatment(
  (select id from public.encounters order by created_at desc limit 1),
  '{"procedure":"Wound dressing"}'::jsonb);
rollback;
