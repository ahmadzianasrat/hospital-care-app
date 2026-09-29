-- =====================================================================
-- PHASE 1A: DEMO SEED  (ALL DATA IS FAKE)
-- BEFORE running: create these users in Supabase
--   Dashboard > Authentication > Users > Add user (tick "Auto Confirm User")
--   Use any password you like (same one for all is fine for the demo).
--
--   admin@demo.test           headnurse@demo.test      chief@demo.test
--   nurse.ahmad@demo.test     nurse.zara@demo.test     doctor@demo.test
--   trainer@demo.test         fap.nurse@demo.test      kb.doctor@demo.test
-- =====================================================================

-- facilities (names and codes are placeholders; change later)
insert into public.facilities (code, name, type, enabled_modules) values
  ('HL','Demo Hospital Helmand','hospital', array['triage','opd','wards','surgery','roster','training','referral']),
  ('KB','Demo Hospital Kabul','hospital',   array['triage','opd','wards','surgery','roster','training','referral']),
  ('PJ','Demo Hospital Panjshir','hospital',array['triage','opd','wards','surgery','roster','training','referral']),
  ('FA','Demo First Aid Post','fap',        array['triage','referral'])
on conflict (code) do nothing;

-- placeholder shift times: EDIT to match the real hospital
insert into public.shift_types (facility_id, code, name, start_time, end_time, counts_as_duty)
select f.id, v.code, v.name, v.st::time, v.et::time, v.duty
from public.facilities f
cross join (values
  ('morning','Morning','08:00','16:00', true),
  ('night','Night','16:00','08:00', true),
  ('off','Day off', null, null, false)
) as v(code, name, st, et, duty)
on conflict (facility_id, code) do nothing;

insert into public.wards (facility_id, code, name)
select f.id, w.code, w.name
from public.facilities f
cross join (values ('ALPHA','Ward Alpha'),('BRAVO','Ward Bravo'),('FEMALE','Female Ward')) as w(code, name)
where f.type = 'hospital'
on conflict (facility_id, code) do nothing;

-- staff linked to the auth users you created
with demo(email, fac, name, prof, role) as (values
  ('admin@demo.test',       'HL','Demo Admin',           'admin_staff','admin'),
  ('headnurse@demo.test',   'HL','Demo Head Nurse',      'nurse',      'head_nurse'),
  ('chief@demo.test',       'HL','Demo Chief Surgeon',   'doctor',     'chief_surgeon'),
  ('nurse.ahmad@demo.test', 'HL','Nurse Ahmad (demo)',   'nurse',      'nurse'),
  ('nurse.zara@demo.test',  'HL','Nurse Zara (demo)',    'nurse',      'nurse'),
  ('doctor@demo.test',      'HL','Dr Demo Doctor',       'doctor',     'doctor'),
  ('trainer@demo.test',     'HL','Demo Trainer',         'trainer',    'trainer'),
  ('fap.nurse@demo.test',   'FA','FAP Nurse (demo)',     'nurse',      'nurse'),
  ('kb.doctor@demo.test',   'KB','Kabul Doctor (demo)',  'doctor',     'doctor')
)
insert into public.staff (user_id, facility_id, full_name, profession, app_role)
select u.id, f.id, d.name, d.prof, d.role
from demo d
join auth.users u on u.email = d.email
join public.facilities f on f.code = d.fac
on conflict (user_id) do nothing;

-- Ahmad: published MORNING shift today in Ward Alpha (Kabul time)
insert into public.roster_entries (facility_id, staff_id, ward_id, shift_type_id, work_date, status)
select s.facility_id, s.id,
       (select w.id from public.wards w where w.facility_id = s.facility_id and w.code = 'ALPHA'),
       st.id, (now() at time zone 'Asia/Kabul')::date, 'published'
from public.staff s
join auth.users u on u.id = s.user_id
join public.shift_types st on st.facility_id = s.facility_id and st.code = 'morning'
where u.email = 'nurse.ahmad@demo.test'
on conflict do nothing;

-- Zara has NO shift (used to test lockout).
-- Doctors and the FAP nurse are "on call" for 30 days so you can test easily.
insert into public.on_call_windows (facility_id, staff_id, starts_at, ends_at, note)
select s.facility_id, s.id, now() - interval '1 day', now() + interval '30 days', 'demo on-call'
from public.staff s join auth.users u on u.id = s.user_id
where u.email in ('doctor@demo.test','fap.nurse@demo.test','kb.doctor@demo.test');

-- fake patients for Helmand (numbers 90001-90003 = obviously demo)
insert into public.patients (facility_id, facility_code, seq, full_name, father_name, sex, age_years, district, blood_group, allergy_status)
select f.id, 'HL', v.seq, v.name, v.father, v.sex, v.age, v.district, v.bg, 'unknown'
from public.facilities f
cross join (values
  (90001,'Test Patient One','Test Father A','male',45,'Demo District','A+'),
  (90002,'Test Patient Two','Test Father B','female',30,'Demo District','O+'),
  (90003,'Test Patient Three','Test Father C','male',8,'Demo District','Unknown')
) as v(seq, name, father, sex, age, district, bg)
where f.code = 'HL'
on conflict do nothing;

update public.patient_counters set last_seq = 90003
where facility_id = (select id from public.facilities where code = 'HL');

insert into public.external_identifiers (patient_id, facility_id, system, value)
select p.id, p.facility_id, 'radiology', '100001'
from public.patients p where p.display_id = '90001HL'
on conflict do nothing;
