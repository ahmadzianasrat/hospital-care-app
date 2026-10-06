-- =====================================================================
-- 20: TESTS FOR STEP 1K (reports & dashboard). Run each block SEPARATELY.
-- Everything is rolled back at the end.
-- =====================================================================

-- TEST AB: admin sees only their own facility; head nurse sees every facility (cross-facility
-- read, same rule as everywhere else in this app). Expect: admin gets 1 row (HL); head nurse
-- gets 4 rows (HL, KB, PJ, FA).
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;
select count(*) as admin_sees_facilities from public.report_summary('2020-01-01', '2030-01-01');
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'headnurse@demo.test';
set local role authenticated;
select count(*) as head_nurse_sees_facilities from public.report_summary('2020-01-01', '2030-01-01');
rollback;

-- TEST AC: the priority and incident breakdowns reflect a real triaged visit.
-- Expect at least one row once you have triaged any patient in this date range.
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select * from public.report_priority_breakdown('2020-01-01', '2030-01-01') order by priority;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select * from public.report_incident_breakdown('2020-01-01', '2030-01-01');
rollback;

-- TEST AD: the patient-level CSV export is available to head nurse / chief surgeon / coordinator,
-- but NOT to admin - admin cannot read individual patients anywhere else in this app either, so
-- reports keep that same rule. Expect: admin gets an error; chief surgeon gets rows (no error).
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'admin@demo.test';
set local role authenticated;
select * from public.report_encounters_export('2020-01-01', '2030-01-01');
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'chief@demo.test';
set local role authenticated;
select count(*) as chief_can_export from public.report_encounters_export('2020-01-01', '2030-01-01');
rollback;

-- TEST AE: a plain nurse, and staff at a different facility, cannot see reports at all.
-- Expect the same error both times: "No access: your role cannot do this"
begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'nurse.ahmad@demo.test';
set local role authenticated;
select * from public.report_summary('2020-01-01', '2030-01-01');
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true)
from auth.users where email = 'kb.doctor@demo.test';
set local role authenticated;
select * from public.report_summary('2020-01-01', '2030-01-01');
rollback;
