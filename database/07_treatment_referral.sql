-- =====================================================================
-- 07: STEP 1D  (run AFTER 01, 02, 04, 05; safe to run twice)
-- Quick treatment + referrals between facilities.
-- The referral snapshot (what the receiving facility sees) is built by the
-- DATABASE from the real chart, not typed by the sender's app.
-- =====================================================================

alter table public.referrals
  add column if not exists arrived_patient_id uuid references public.patients(id),
  add column if not exists arrived_at timestamptz;

-- only one live referral per visit (a cancelled one can be replaced)
create unique index if not exists referrals_one_active
  on public.referrals (encounter_id) where status <> 'cancelled';

-- From now on, documents and referrals are written ONLY by the functions.
revoke insert on public.documents from authenticated;
revoke insert, update on public.referrals from authenticated;

-- ---------- QUICK TREATMENT ----------
create or replace function public.add_quick_treatment(
  p_encounter_id uuid,
  p_data jsonb,
  p_doc_id uuid default gen_random_uuid()
) returns public.documents
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters; v_doc public.documents;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid treatment data'; end if;
  if length(trim(coalesce(p_data->>'procedure','') || coalesce(p_data->>'drug',''))) < 2 then
    raise exception 'Enter a procedure or a drug';
  end if;

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Visit not found'; end if;

  select * into v_doc from public.documents where id = p_doc_id and encounter_id = p_encounter_id;
  if found then return v_doc; end if;              -- retry: already saved

  if v_enc.status not in ('waiting_opd','in_opd') then
    raise exception 'Treatments can only be added while the patient is in OPD (status: %)', v_enc.status;
  end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, 'quick_treatment',
          p_data || jsonb_build_object('given_at', now(), 'given_by', v_staff.full_name), v_staff.id)
  returning * into v_doc;
  return v_doc;
end $$;

-- ---------- CREATE A REFERRAL ----------
create or replace function public.create_referral(
  p_encounter_id uuid,
  p_to_facility_id uuid,
  p_to_external text,
  p_reason text,
  p_eta timestamptz,
  p_treatment_given text,
  p_transport text default null,
  p_id uuid default gen_random_uuid()
) returns public.referrals
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_enc public.encounters; v_pat public.patients; v_from public.facilities;
  v_ref public.referrals; v_payload jsonb;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_ref from public.referrals where id = p_id and from_facility_id = v_staff.facility_id;
  if found then return v_ref; end if;              -- retry: already saved

  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason for the referral'; end if;
  if p_to_facility_id is null and length(trim(coalesce(p_to_external,''))) < 2 then
    raise exception 'Choose where the patient is going';
  end if;
  if p_to_facility_id = v_staff.facility_id then raise exception 'Choose a different facility'; end if;
  if p_to_facility_id is not null and not exists (select 1 from public.facilities where id = p_to_facility_id) then
    raise exception 'Unknown facility';
  end if;

  select * into v_enc from public.encounters
   where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;
  if v_enc.status <> 'referred_out' then
    raise exception 'This visit is not marked for referral (status: %)', v_enc.status;
  end if;
  if exists (select 1 from public.referrals where encounter_id = p_encounter_id and status <> 'cancelled') then
    raise exception 'A referral already exists for this visit';
  end if;

  select * into v_pat  from public.patients   where id = v_enc.patient_id;
  select * into v_from from public.facilities where id = v_staff.facility_id;

  v_payload := jsonb_build_object(
    'patient', jsonb_build_object(
      'display_id', v_pat.display_id, 'full_name', v_pat.full_name, 'father_name', v_pat.father_name,
      'sex', v_pat.sex, 'age_years', v_pat.age_years, 'phone', v_pat.phone, 'district', v_pat.district,
      'blood_group', v_pat.blood_group, 'allergy_status', v_pat.allergy_status,
      'allergy_details', v_pat.allergy_details),
    'triage', jsonb_build_object(
      'priority', v_enc.triage_priority,
      'data', (select d.data from public.documents d
                where d.encounter_id = v_enc.id and d.doc_type = 'first_assessment'
                order by d.created_at limit 1)),
    'opd', (select d.data from public.documents d
             where d.encounter_id = v_enc.id and d.doc_type = 'opd_note'
             order by d.created_at desc limit 1),
    'treatments', (select coalesce(jsonb_agg(d.data order by d.created_at), '[]'::jsonb)
                     from public.documents d
                    where d.encounter_id = v_enc.id and d.doc_type = 'quick_treatment'),
    'treatment_given', nullif(trim(coalesce(p_treatment_given,'')), ''),
    'transport', nullif(trim(coalesce(p_transport,'')), ''),
    'from', jsonb_build_object('facility_code', v_from.code, 'facility_name', v_from.name,
                               'sender', v_staff.full_name));

  insert into public.referrals (id, encounter_id, from_facility_id, to_facility_id, to_external,
                                reason, eta, payload, created_by)
  values (p_id, p_encounter_id, v_staff.facility_id, p_to_facility_id,
          nullif(trim(coalesce(p_to_external,'')), ''), trim(p_reason), p_eta, v_payload, v_staff.id)
  returning * into v_ref;
  return v_ref;
end $$;

-- ---------- REFERRAL STATUS (acknowledge / cancel) ----------
create or replace function public.update_referral_status(p_referral_id uuid, p_status text)
returns public.referrals
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_ref public.referrals; v_is_receiver boolean; v_is_sender boolean;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_ref from public.referrals where id = p_referral_id for update;
  if not found then raise exception 'Referral not found'; end if;

  v_is_receiver := v_ref.to_facility_id = v_staff.facility_id;
  v_is_sender   := v_ref.from_facility_id = v_staff.facility_id;
  if not (v_is_receiver or v_is_sender) then raise exception 'Referral not found'; end if;

  if v_ref.status = p_status then return v_ref; end if;

  if p_status = 'received' then
    if not v_is_receiver or v_ref.status <> 'sent' then raise exception 'Cannot acknowledge this referral'; end if;
  elsif p_status = 'cancelled' then
    if not v_is_sender or v_ref.status not in ('sent','received') then raise exception 'Cannot cancel this referral'; end if;
  else
    raise exception 'Unsupported status (arrival is recorded by registering the patient)';
  end if;

  update public.referrals set status = p_status where id = p_referral_id returning * into v_ref;
  return v_ref;
end $$;

-- ---------- ARRIVAL: link the referral to the patient registered here ----------
create or replace function public.link_referral_arrival(p_referral_id uuid, p_patient_id uuid)
returns public.referrals
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_ref public.referrals;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_ref from public.referrals
   where id = p_referral_id and to_facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Referral not found'; end if;

  perform 1 from public.patients where id = p_patient_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Patient not found at your facility'; end if;

  if v_ref.status = 'arrived' then
    if v_ref.arrived_patient_id = p_patient_id then return v_ref; end if;
    raise exception 'This referral is already linked to another patient';
  end if;
  if v_ref.status not in ('sent','received') then raise exception 'Referral is %', v_ref.status; end if;

  update public.referrals
     set status = 'arrived', arrived_patient_id = p_patient_id, arrived_at = now()
   where id = p_referral_id returning * into v_ref;
  return v_ref;
end $$;

-- ---------- permissions ----------
revoke execute on function public.add_quick_treatment(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.create_referral(uuid, uuid, text, text, timestamptz, text, text, uuid) from public, anon;
revoke execute on function public.update_referral_status(uuid, text) from public, anon;
revoke execute on function public.link_referral_arrival(uuid, uuid) from public, anon;

grant execute on function public.add_quick_treatment(uuid, jsonb, uuid) to authenticated;
grant execute on function public.create_referral(uuid, uuid, text, text, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.update_referral_status(uuid, text) to authenticated;
grant execute on function public.link_referral_arrival(uuid, uuid) to authenticated;
