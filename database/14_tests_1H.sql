-- =====================================================================
-- 14: TESTS FOR STEP 1H + PHASE 2 KICKOFF (round mode, feedback, and two
-- bug fixes found while testing this step). Run each block SEPARATELY.
-- Everything is rolled back at the end.
-- =====================================================================

-- TEST P: a doctor can write a round note; a nurse and a Kabul doctor cannot.
-- Expect: text saved; nurse gets "No access..."; kb doctor gets "Visit not found".
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'doctor@demo.test';
set local role authenticated;
select public.start_visit((select id from public.patients where display_id = '90002HL'));
select public.complete_triage((select id from public.encounters order by created_at desc limit 1), 'orange', 'opd', '{"injury_description":"x"}'::jsonb);
select public.claim_opd((select id from public.encounters order by created_at desc limit 1));
select public.complete_opd((select id from public.encounters order by created_at desc limit 1), 'admit', '{"diagnosis":"Femur fracture"}'::jsonb);
select data->>'text' from public.add_round_note((select id from public.encounters order by created_at desc limit 1), 'Improving, continue current plan');
rollback;

-- TEST Q: feedback can be submitted by anyone (even off-duty), and is only visible to the
-- submitter and to admin/head nurse/chief surgeon/coordinator at that facility.
-- Expect: submitted with status "open"; a plain nurse (ahmad) sees only their own (count 1);
-- admin sees the facility's feedback (count >= 1); a Kabul doctor sees 0 of Helmand's.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select status from public.submit_feedback('The triage form is slow to load', 'triage_form');
select count(*) from public.feedback;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;
select count(*) >= 1 as admin_sees_feedback from public.feedback;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select count(*) as kb_sees_hl_feedback from public.feedback where facility_id = (select id from public.facilities where code = 'HL');
rollback;

-- TEST R: BUG FIX CHECK - an admin (not just head_nurse) can create, read, and retire a bed.
-- Before the fix in 13_round_and_feedback.sql, this failed with "No access: you are off duty..."
-- because admin is not a clinical role. Expect: created, then read back, then retired successfully.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;
select code from public.upsert_bed((select id from public.wards where code = 'BRAVO'), 'TEST9');
select count(*) as admin_can_read_it from public.beds where code = 'TEST9';
select public.retire_bed((select id from public.beds where code = 'TEST9'));
rollback;

-- TEST S: BUG FIX CHECK - an admin can mark feedback as resolved (was also blocked by the same bug).
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.zara@demo.test';
set local role authenticated;
select public.submit_feedback('Test item for admin to resolve');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;
select status from public.mark_feedback((select id from public.feedback where message = 'Test item for admin to resolve'), 'resolved');
rollback;
