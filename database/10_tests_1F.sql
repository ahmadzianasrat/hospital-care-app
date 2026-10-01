-- =====================================================================
-- 10: TESTS FOR STEP 1F. Run each block SEPARATELY (select it, then Run).
-- Everything is rolled back at the end. Uses "doctor@demo.test" (on call
-- all day) throughout so the results do not depend on what time you run this.
-- =====================================================================

-- TEST H: full ward journey - admit, assign a bed, order medicine, complete a dose, discharge.
-- Expect: assigned=true, tid_tasks=6, stat_done=done, freed=true, active_orders_left=0
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;

select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  'orange', 'opd', '{"injury_description":"fracture"}'::jsonb);
select public.claim_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1), 'admit', '{"diagnosis":"Femur fracture"}'::jsonb);

select public.assign_bed(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  (select b.id from public.beds b join public.wards w on w.id = b.ward_id where w.code = 'ALPHA' and b.code = '1'));

select public.create_order(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  'medication', '{"instruction":"Ceftriaxone 1g"}'::jsonb, 'tid', 2);
select public.create_order(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  'medication', '{"instruction":"Tetanus STAT"}'::jsonb, 'stat', 1);

select public.complete_task(
  (select id from public.tasks where order_id = (select id from public.orders where details->>'instruction' = 'Tetanus STAT') limit 1));

select public.discharge_from_ward(
  (select id from public.encounters where patient_id = (select id from public.patients where display_id = '90002HL') order by created_at desc limit 1),
  '{"summary":"Healed well, follow up in 2 weeks"}'::jsonb);

select
  (select count(*) from public.bed_stays where encounter_id = e.id and to_at is not null) > 0 as freed,
  (select count(*) from public.tasks where order_id = (select id from public.orders where details->>'instruction' = 'Ceftriaxone 1g')) as tid_tasks,
  (select status from public.tasks where order_id = (select id from public.orders where details->>'instruction' = 'Tetanus STAT') limit 1) as stat_status,
  (select count(*) from public.orders where encounter_id = e.id and status = 'active') as active_orders_left,
  e.status
from public.encounters e
where e.patient_id = (select id from public.patients where display_id = '90002HL')
order by e.created_at desc limit 1;
rollback;

-- TEST I: a bed cannot be double-booked (expect an error: "That bed is already occupied").
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;

select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters order by created_at desc limit 1), 'admit', '{"diagnosis":"x"}'::jsonb);
select public.assign_bed((select id from public.encounters order by created_at desc limit 1),
  (select b.id from public.beds b join public.wards w on w.id = b.ward_id where w.code = 'ALPHA' and b.code = '1'));

select public.start_visit((select id from public.patients where display_id = '90003HL'));
select public.complete_triage((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90003HL') order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90003HL') order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90003HL') order by created_at desc limit 1), 'admit', '{"diagnosis":"x"}'::jsonb);
select public.assign_bed((select id from public.encounters where patient_id = (select id from public.patients where display_id = '90003HL') order by created_at desc limit 1),
  (select b.id from public.beds b join public.wards w on w.id = b.ward_id where w.code = 'ALPHA' and b.code = '1'));
rollback;

-- TEST J: only a doctor or chief surgeon may write an order (expect: "No access: you are off duty or your role cannot do this").
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select public.create_order(
  (select id from public.encounters limit 1), 'medication', '{"instruction":"test"}'::jsonb, 'od', 1);
rollback;

-- TEST K: the Kabul doctor cannot see Helmand beds, but the chief surgeon can see all facilities.
-- Expect: kb_sees_hl_beds = 0, chief_sees_total > 0
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as kb_sees_hl_beds from public.beds where facility_id = (select id from public.facilities where code = 'HL');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select count(*) as chief_sees_total from public.beds;
rollback;
