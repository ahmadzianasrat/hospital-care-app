-- =====================================================================
-- 19: STEP 1K - REPORTS & DASHBOARD  (run AFTER 01,02,04,05,07,09,15; safe twice)
-- Read-only aggregate reporting. No new tables; everything here computes
-- from data already captured. All functions are SECURITY DEFINER because
-- they aggregate across facilities for some roles, so each one applies
-- its own facility scoping instead of relying on table RLS.
--
-- Privacy note: admin can see AGGREGATE COUNTS (no patient identities),
-- matching the fact that admin cannot read the patients table anywhere
-- else in this app. The one function that lists real patients
-- (report_encounters_export, for CSV download) is restricted to
-- head_nurse / chief_surgeon / coordinator - the roles that already have
-- cross-facility patient read access - and deliberately excludes admin.
-- =====================================================================

-- Facilities a given staff member's reports should cover: every facility if their role already has
-- cross-facility clinical read access elsewhere in the app (head_nurse/chief_surgeon/coordinator),
-- otherwise just their own.
create or replace function public.report_facility_scope(p_staff public.staff)
returns table (id uuid, code text)
language sql stable as $$
  select f.id, f.code
  from public.facilities f
  where (p_staff.app_role in ('head_nurse','chief_surgeon','coordinator')) or f.id = p_staff.facility_id
$$;

create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (
  facility_code text, total_visits bigint, currently_waiting bigint, currently_admitted bigint,
  discharged bigint, referred_out bigint
)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code,
    count(e.id),
    count(e.id) filter (where e.status in ('waiting_triage','waiting_opd','in_opd')),
    count(e.id) filter (where e.status = 'admitted'),
    count(e.id) filter (where e.status = 'discharged'),
    count(e.id) filter (where e.status = 'referred_out')
  from public.report_facility_scope(v_staff) f
  left join public.encounters e on e.facility_id = f.id and e.arrived_at between p_from and p_to
  group by f.code
  order by f.code;
end $$;

create or replace function public.report_priority_breakdown(p_from timestamptz, p_to timestamptz)
returns table (facility_code text, priority text, visits bigint)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code, e.triage_priority, count(*)
  from public.report_facility_scope(v_staff) f
  join public.encounters e on e.facility_id = f.id
  where e.triaged_at between p_from and p_to and e.triage_priority is not null
  group by f.code, e.triage_priority
  order by f.code, e.triage_priority;
end $$;

create or replace function public.report_incident_breakdown(p_from timestamptz, p_to timestamptz)
returns table (facility_code text, incident text, visits bigint)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code, coalesce(d.data->'arrival'->>'incident', 'Not recorded'), count(*)
  from public.report_facility_scope(v_staff) f
  join public.encounters e on e.facility_id = f.id
  join public.documents d on d.encounter_id = e.id and d.doc_type = 'first_assessment'
  where e.arrived_at between p_from and p_to
  group by f.code, coalesce(d.data->'arrival'->>'incident', 'Not recorded')
  order by f.code, visits desc;
end $$;

-- Length of stay = time from arrival to final discharge (straight from OPD, or after a ward stay -
-- outcome_at always reflects whichever came last), for visits discharged in the period.
create or replace function public.report_length_of_stay(p_from timestamptz, p_to timestamptz)
returns table (facility_code text, discharged_count bigint, avg_hours numeric)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code, count(e.id),
    round(avg(extract(epoch from (e.outcome_at - e.arrived_at)) / 3600)::numeric, 1)
  from public.report_facility_scope(v_staff) f
  join public.encounters e on e.facility_id = f.id
  where e.status = 'discharged' and e.outcome_at between p_from and p_to
  group by f.code
  order by f.code;
end $$;

create or replace function public.report_ot_stats(p_from timestamptz, p_to timestamptz)
returns table (
  facility_code text, completed_cases bigint, emergency_cases bigint, elective_cases bigint,
  alive_count bigint, deceased_count bigint
)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code, count(s.id),
    count(s.id) filter (where s.urgency = 'emergency'),
    count(s.id) filter (where s.urgency = 'elective'),
    count(s.id) filter (where s.outcome = 'alive'),
    count(s.id) filter (where s.outcome = 'deceased')
  from public.report_facility_scope(v_staff) f
  left join public.surgeries s on s.facility_id = f.id and s.status = 'completed' and s.actual_end between p_from and p_to
  group by f.code
  order by f.code;
end $$;

create or replace function public.report_referral_stats(p_from timestamptz, p_to timestamptz)
returns table (facility_code text, sent bigint, received bigint, arrived bigint, cancelled_sent bigint)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code,
    (select count(*) from public.referrals r where r.from_facility_id = f.id and r.created_at between p_from and p_to),
    (select count(*) from public.referrals r where r.to_facility_id = f.id and r.created_at between p_from and p_to),
    (select count(*) from public.referrals r where r.to_facility_id = f.id and r.status = 'arrived' and r.created_at between p_from and p_to),
    (select count(*) from public.referrals r where r.from_facility_id = f.id and r.status = 'cancelled' and r.created_at between p_from and p_to)
  from public.report_facility_scope(v_staff) f
  order by f.code;
end $$;

-- The one function in this file that returns real patient identities, for a CSV download.
-- Deliberately excludes admin - see the privacy note at the top of this file.
create or replace function public.report_encounters_export(p_from timestamptz, p_to timestamptz)
returns table (
  facility_code text, display_id text, full_name text, age_years integer, sex text,
  arrived_at timestamptz, triage_priority text, status text, diagnosis text
)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['head_nurse','chief_surgeon','coordinator']);
  return query
  select f.code, p.display_id, p.full_name, p.age_years, p.sex, e.arrived_at, e.triage_priority, e.status,
    coalesce(
      (select d.data->>'diagnosis' from public.documents d where d.encounter_id = e.id and d.doc_type = 'opd_note' order by d.created_at desc limit 1),
      (select s.diagnosis from public.surgeries s where s.encounter_id = e.id order by s.booked_at desc limit 1),
      (select d.data->>'summary' from public.documents d where d.encounter_id = e.id and d.doc_type = 'ward_discharge' order by d.created_at desc limit 1)
    )
  from public.report_facility_scope(v_staff) f
  join public.encounters e on e.facility_id = f.id and e.arrived_at between p_from and p_to
  join public.patients p on p.id = e.patient_id
  order by e.arrived_at;
end $$;

revoke execute on function
  public.report_summary(timestamptz, timestamptz), public.report_priority_breakdown(timestamptz, timestamptz),
  public.report_incident_breakdown(timestamptz, timestamptz), public.report_length_of_stay(timestamptz, timestamptz),
  public.report_ot_stats(timestamptz, timestamptz), public.report_referral_stats(timestamptz, timestamptz),
  public.report_encounters_export(timestamptz, timestamptz)
  from public, anon;
grant execute on function
  public.report_summary(timestamptz, timestamptz), public.report_priority_breakdown(timestamptz, timestamptz),
  public.report_incident_breakdown(timestamptz, timestamptz), public.report_length_of_stay(timestamptz, timestamptz),
  public.report_ot_stats(timestamptz, timestamptz), public.report_referral_stats(timestamptz, timestamptz),
  public.report_encounters_export(timestamptz, timestamptz)
  to authenticated;
