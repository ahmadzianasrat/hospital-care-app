-- =====================================================================
-- 04: CHANGES FOR STEP 1B  (run AFTER 01 and 02; safe to run twice)
--  1. Duty grace: 5 minutes BEFORE a shift, 15 minutes AFTER it ends.
--  2. Facility isolation: staff can only see their OWN facility's patient data.
--     Exception (read-only, all facilities): chief_surgeon, coordinator, head_nurse.
--  Night shift is 16:00-08:00 (already how 02_seed_demo.sql set it up).
-- =====================================================================

-- 1. DUTY CHECK with separate before/after grace
create or replace function public.is_on_duty(p_staff uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text; v_tz text; v_now_local timestamp;
  v_before interval := interval '5 minutes';     -- access opens this early
  v_after  interval := interval '15 minutes';    -- access stays open this long after shift
begin
  select s.app_role, f.timezone into v_role, v_tz
  from public.staff s join public.facilities f on f.id = s.facility_id
  where s.id = p_staff and s.active;
  if not found then return false; end if;

  if v_role in ('admin','head_nurse','chief_surgeon','coordinator','trainer') then
    return true;
  end if;

  if public.break_glass_active(p_staff) then return true; end if;

  if exists (select 1 from public.on_call_windows o
             where o.staff_id = p_staff and now() between o.starts_at and o.ends_at) then
    return true;
  end if;

  v_now_local := now() at time zone v_tz;

  return exists (
    select 1
    from public.roster_entries r
    join public.shift_types st on st.id = r.shift_type_id
    where r.staff_id = p_staff
      and r.status = 'published'
      and st.counts_as_duty
      and r.work_date between (v_now_local::date - 1) and (v_now_local::date + 1)
      and v_now_local between
            ((r.work_date + st.start_time) - v_before)
        and ((r.work_date + st.start_time)
              + case when st.end_time > st.start_time
                     then (st.end_time - st.start_time)
                     else (st.end_time - st.start_time) + interval '24 hours' end
              + v_after)
  );
end $$;

-- 2. READ ACCESS: own facility (clinical roles, on duty) OR cross-facility roles
create or replace function public.clinical_read_access(p_facility uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.clinical_access(p_facility)
      or exists (select 1 from public.staff s
                 where s.user_id = auth.uid() and s.active
                   and s.app_role in ('chief_surgeon','coordinator','head_nurse'))
$$;
revoke execute on function public.clinical_read_access(uuid) from public, anon;
grant  execute on function public.clinical_read_access(uuid) to authenticated;

-- read policies now use clinical_read_access; WRITE policies are unchanged (own facility only)
drop policy if exists patients_read on public.patients;
create policy patients_read on public.patients for select to authenticated
  using (public.clinical_read_access(facility_id));

drop policy if exists extid_read on public.external_identifiers;
create policy extid_read on public.external_identifiers for select to authenticated
  using (public.clinical_read_access(facility_id));

drop policy if exists enc_read on public.encounters;
create policy enc_read on public.encounters for select to authenticated
  using (public.clinical_read_access(facility_id));

drop policy if exists docs_read on public.documents;
create policy docs_read on public.documents for select to authenticated
  using (public.clinical_read_access(facility_id));

-- referrals: sender side, receiving side (on duty), or cross-facility roles
drop policy if exists ref_read on public.referrals;
create policy ref_read on public.referrals for select to authenticated
  using (public.clinical_read_access(from_facility_id)
         or (to_facility_id is not null and public.clinical_access(to_facility_id)));

-- a fake Kabul patient, so isolation can be tested
insert into public.patients (facility_id, facility_code, seq, full_name, father_name, sex, age_years, blood_group)
select f.id, 'KB', 80001, 'Test Kabul Patient', 'Test Father K', 'male', 35, 'B+'
from public.facilities f where f.code = 'KB'
on conflict do nothing;

update public.patient_counters set last_seq = greatest(last_seq, 80001)
where facility_id = (select id from public.facilities where code = 'KB');
