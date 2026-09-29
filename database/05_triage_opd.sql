-- =====================================================================
-- 05: STEP 1C  (run AFTER 01, 02, 04; safe to run twice)
-- Visit / triage / OPD workflow as database functions, so every step is
-- atomic (document + status change together), permission-checked, safe to
-- retry (idempotent), and safe when two doctors tap the same patient.
-- =====================================================================

alter table public.encounters
  add column if not exists opd_doctor_id  uuid references public.staff(id),
  add column if not exists opd_started_at timestamptz,
  add column if not exists outcome_at     timestamptz;

-- From now on encounters change ONLY through the functions below.
revoke insert, update on public.encounters from authenticated;

-- ---------- helper: who is calling, and are they allowed? ----------
create or replace function public.require_staff(p_roles text[]) returns public.staff
language plpgsql stable security definer set search_path = public as $$
declare v public.staff;
begin
  select * into v from public.staff where user_id = auth.uid() and active;
  if not found then
    raise exception 'Not a staff member' using errcode = '42501';
  end if;
  if not public.can_write(v.facility_id, p_roles) then
    raise exception 'No access: you are off duty or your role cannot do this' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------- START A VISIT ----------
create or replace function public.start_visit(p_patient_id uuid, p_id uuid default gen_random_uuid())
returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  -- same request sent twice (offline retry): return the same visit
  select * into v_enc from public.encounters where id = p_id and facility_id = v_staff.facility_id;
  if found then return v_enc; end if;

  perform 1 from public.patients where id = p_patient_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Patient not found at your facility'; end if;

  -- never create a second open visit for the same patient
  select * into v_enc from public.encounters
   where patient_id = p_patient_id
     and status in ('waiting_triage','waiting_opd','in_opd','admitted')
   order by arrived_at desc limit 1;
  if found then return v_enc; end if;

  insert into public.encounters (id, patient_id, facility_id, created_by)
  values (p_id, p_patient_id, v_staff.facility_id, v_staff.id)
  returning * into v_enc;
  return v_enc;
end $$;

-- ---------- COMPLETE TRIAGE ----------
create or replace function public.complete_triage(
  p_encounter_id uuid,
  p_priority text,
  p_decision text,
  p_data jsonb,
  p_doc_id uuid default gen_random_uuid()
) returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  if p_priority not in ('red','orange','yellow','green') then raise exception 'Choose a priority'; end if;
  if p_decision not in ('opd','refer') then raise exception 'Choose: send to OPD or refer'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid triage data'; end if;

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;

  -- retry of an already saved triage: return as is
  if exists (select 1 from public.documents where id = p_doc_id and encounter_id = p_encounter_id) then
    return v_enc;
  end if;

  if v_enc.status <> 'waiting_triage' then
    raise exception 'This visit was already triaged (status: %)', v_enc.status;
  end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, 'first_assessment', p_data, v_staff.id);

  update public.encounters set
    triage_priority = p_priority,
    triage_decision = p_decision,
    triaged_by = v_staff.id,
    triaged_at = now(),
    status = case p_decision when 'opd' then 'waiting_opd' else 'referred_out' end
  where id = p_encounter_id
  returning * into v_enc;
  return v_enc;
end $$;

-- ---------- OPD: TAKE / RELEASE / COMPLETE ----------
create or replace function public.claim_opd(p_encounter_id uuid) returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;

  if v_enc.status = 'in_opd' then
    if v_enc.opd_doctor_id = v_staff.id then return v_enc; end if;
    raise exception 'Another doctor is already seeing this patient';
  end if;
  if v_enc.status <> 'waiting_opd' then
    raise exception 'This patient is not waiting for OPD (status: %)', v_enc.status;
  end if;

  update public.encounters set status = 'in_opd', opd_doctor_id = v_staff.id, opd_started_at = now()
   where id = p_encounter_id returning * into v_enc;
  return v_enc;
end $$;

create or replace function public.release_opd(p_encounter_id uuid) returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;
  if v_enc.status <> 'in_opd' then return v_enc; end if;
  if v_enc.opd_doctor_id <> v_staff.id and v_staff.app_role <> 'chief_surgeon' then
    raise exception 'Only the doctor seeing this patient can put them back';
  end if;

  update public.encounters set status = 'waiting_opd', opd_doctor_id = null, opd_started_at = null
   where id = p_encounter_id returning * into v_enc;
  return v_enc;
end $$;

create or replace function public.complete_opd(
  p_encounter_id uuid,
  p_outcome text,
  p_data jsonb,
  p_doc_id uuid default gen_random_uuid()
) returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters; v_status text;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  v_status := case p_outcome
                when 'discharge' then 'discharged'
                when 'admit'     then 'admitted'
                when 'refer'     then 'referred_out'
                else null end;
  if v_status is null then raise exception 'Choose an outcome: discharge, admit or refer'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid note'; end if;
  if length(trim(coalesce(p_data->>'diagnosis',''))) < 2 then raise exception 'Diagnosis is required'; end if;

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;

  if exists (select 1 from public.documents where id = p_doc_id and encounter_id = p_encounter_id) then
    return v_enc;
  end if;

  if v_enc.status <> 'in_opd' then
    raise exception 'This visit is not in OPD (status: %)', v_enc.status;
  end if;
  if v_enc.opd_doctor_id <> v_staff.id and v_staff.app_role <> 'chief_surgeon' then
    raise exception 'Another doctor is seeing this patient';
  end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, 'opd_note',
          p_data || jsonb_build_object('outcome', p_outcome), v_staff.id);

  update public.encounters set status = v_status, outcome_at = now()
   where id = p_encounter_id returning * into v_enc;
  return v_enc;
end $$;

-- ---------- permissions on the new functions ----------
revoke execute on function public.require_staff(text[])                          from public, anon;
revoke execute on function public.start_visit(uuid, uuid)                        from public, anon;
revoke execute on function public.complete_triage(uuid, text, text, jsonb, uuid) from public, anon;
revoke execute on function public.claim_opd(uuid)                                from public, anon;
revoke execute on function public.release_opd(uuid)                              from public, anon;
revoke execute on function public.complete_opd(uuid, text, jsonb, uuid)          from public, anon;

grant execute on function public.require_staff(text[])                          to authenticated;
grant execute on function public.start_visit(uuid, uuid)                        to authenticated;
grant execute on function public.complete_triage(uuid, text, text, jsonb, uuid) to authenticated;
grant execute on function public.claim_opd(uuid)                                to authenticated;
grant execute on function public.release_opd(uuid)                              to authenticated;
grant execute on function public.complete_opd(uuid, text, jsonb, uuid)          to authenticated;
