-- =====================================================================
-- 11: STEP 1G  (run AFTER 01, 02, 04, 05, 07, 09; safe to run twice)
-- Nursing charts: vitals/GCS observations, circulation checks, fluid
-- balance (intake/output), Barthel index, and nursing/physio notes.
-- =====================================================================

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff(id),
  bp_sys integer, bp_dia integer, hr integer, rr integer, spo2 integer, temp_c numeric(4,1),
  gcs_e integer check (gcs_e between 1 and 4), gcs_v integer check (gcs_v between 1 and 5), gcs_m integer check (gcs_m between 1 and 6),
  pupil_left text, pupil_right text,
  note text
);
create index if not exists observations_encounter_idx on public.observations (encounter_id, recorded_at);

create table if not exists public.circulation_checks (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff(id),
  limb text not null,
  movement text not null check (movement in ('normal','reduced','absent')),
  sensation text not null check (sensation in ('normal','reduced','absent')),
  capillary_refill_sec numeric(3,1),
  temperature text check (temperature in ('warm','cool','cold')),
  color text check (color in ('normal','pale','cyanotic','dusky')),
  bleeding boolean not null default false,
  oozing boolean not null default false,
  note text
);
create index if not exists circulation_encounter_idx on public.circulation_checks (encounter_id, recorded_at);

create table if not exists public.fluid_events (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff(id),
  category text not null check (category in
    ('iv_fluid','blood_product','oral_intake','urine','stool','vomitus','drain','insensible_loss','other_output')),
  direction text not null check (direction in ('in','out')),
  volume_ml numeric(7,1) not null check (volume_ml >= 0),
  note text
);
create index if not exists fluid_events_encounter_idx on public.fluid_events (encounter_id, recorded_at);

create table if not exists public.barthel_assessments (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.staff(id),
  items jsonb not null,   -- {"feeding":10,"bathing":5,...}
  total_score integer not null check (total_score between 0 and 100)
);
create index if not exists barthel_encounter_idx on public.barthel_assessments (encounter_id, recorded_at);

-- nursing / physio free-text notes reuse the existing append-only documents table
alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in
  ('first_assessment','opd_note','quick_treatment','admission','surgery','addendum','ward_discharge',
   'nursing_note','physio_note'));

-- new tables created after the original blanket grant in 01_schema.sql need their own grant.
-- Reads are controlled by RLS below; writes go only through the functions in this file.
grant select, insert, update, delete on
  public.observations, public.circulation_checks, public.fluid_events, public.barthel_assessments
  to authenticated;
revoke insert, update, delete on public.observations       from authenticated;
revoke insert, update, delete on public.circulation_checks from authenticated;
revoke insert, update, delete on public.fluid_events        from authenticated;
revoke insert, update, delete on public.barthel_assessments from authenticated;

-- ---------- helper: an encounter must be admitted or in OPD, and in this staff member's facility ----------
create or replace function public.require_open_encounter(p_encounter_id uuid, p_staff public.staff) returns public.encounters
language plpgsql stable security definer set search_path = public as $$
declare v_enc public.encounters;
begin
  select * into v_enc from public.encounters where id = p_encounter_id and facility_id = p_staff.facility_id;
  if not found then raise exception 'Visit not found'; end if;
  if v_enc.status not in ('admitted','waiting_opd','in_opd') then
    raise exception 'Charting is only available for an admitted or OPD visit (status: %)', v_enc.status;
  end if;
  return v_enc;
end $$;

-- ---------- VITALS / GCS ----------
create or replace function public.record_observation(
  p_encounter_id uuid,
  p_bp_sys integer, p_bp_dia integer, p_hr integer, p_rr integer, p_spo2 integer, p_temp_c numeric,
  p_gcs_e integer, p_gcs_v integer, p_gcs_m integer, p_pupil_left text, p_pupil_right text, p_note text
) returns public.observations
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.observations;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);
  perform public.require_open_encounter(p_encounter_id, v_staff);

  insert into public.observations (encounter_id, facility_id, recorded_by, bp_sys, bp_dia, hr, rr, spo2, temp_c,
    gcs_e, gcs_v, gcs_m, pupil_left, pupil_right, note)
  values (p_encounter_id, v_staff.facility_id, v_staff.id, p_bp_sys, p_bp_dia, p_hr, p_rr, p_spo2, p_temp_c,
    p_gcs_e, p_gcs_v, p_gcs_m, nullif(trim(coalesce(p_pupil_left,'')),''), nullif(trim(coalesce(p_pupil_right,'')),''),
    nullif(trim(coalesce(p_note,'')),''))
  returning * into v_row;
  return v_row;
end $$;

-- ---------- CIRCULATION ----------
create or replace function public.record_circulation_check(
  p_encounter_id uuid, p_limb text, p_movement text, p_sensation text, p_capillary_refill_sec numeric,
  p_temperature text, p_color text, p_bleeding boolean, p_oozing boolean, p_note text
) returns public.circulation_checks
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.circulation_checks;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);
  perform public.require_open_encounter(p_encounter_id, v_staff);
  if length(trim(coalesce(p_limb,''))) < 2 then raise exception 'Say which limb'; end if;

  insert into public.circulation_checks (encounter_id, facility_id, recorded_by, limb, movement, sensation,
    capillary_refill_sec, temperature, color, bleeding, oozing, note)
  values (p_encounter_id, v_staff.facility_id, v_staff.id, trim(p_limb), p_movement, p_sensation,
    p_capillary_refill_sec, p_temperature, p_color, coalesce(p_bleeding,false), coalesce(p_oozing,false),
    nullif(trim(coalesce(p_note,'')),''))
  returning * into v_row;
  return v_row;
end $$;

-- ---------- FLUID BALANCE ----------
create or replace function public.category_direction(p_category text) returns text
language sql immutable as $$
  select case p_category when 'iv_fluid' then 'in' when 'blood_product' then 'in' when 'oral_intake' then 'in' else 'out' end
$$;

create or replace function public.record_fluid_event(
  p_encounter_id uuid, p_category text, p_volume_ml numeric, p_note text
) returns public.fluid_events
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.fluid_events;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);
  perform public.require_open_encounter(p_encounter_id, v_staff);
  if p_volume_ml is null or p_volume_ml < 0 then raise exception 'Enter a volume of 0 or more'; end if;

  insert into public.fluid_events (encounter_id, facility_id, recorded_by, category, direction, volume_ml, note)
  values (p_encounter_id, v_staff.facility_id, v_staff.id, p_category, public.category_direction(p_category),
    p_volume_ml, nullif(trim(coalesce(p_note,'')),''))
  returning * into v_row;
  return v_row;
end $$;

-- running totals for a visit: all-time and the last 24 hours
create or replace function public.fluid_balance(p_encounter_id uuid) returns table (
  total_in_ml numeric, total_out_ml numeric, balance_ml numeric,
  last24_in_ml numeric, last24_out_ml numeric, last24_balance_ml numeric
) language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(volume_ml) filter (where direction = 'in'), 0),
    coalesce(sum(volume_ml) filter (where direction = 'out'), 0),
    coalesce(sum(volume_ml) filter (where direction = 'in'), 0) - coalesce(sum(volume_ml) filter (where direction = 'out'), 0),
    coalesce(sum(volume_ml) filter (where direction = 'in' and recorded_at > now() - interval '24 hours'), 0),
    coalesce(sum(volume_ml) filter (where direction = 'out' and recorded_at > now() - interval '24 hours'), 0),
    coalesce(sum(volume_ml) filter (where direction = 'in' and recorded_at > now() - interval '24 hours'), 0)
      - coalesce(sum(volume_ml) filter (where direction = 'out' and recorded_at > now() - interval '24 hours'), 0)
  from public.fluid_events
  where encounter_id = p_encounter_id
    and facility_id = (select facility_id from public.staff where user_id = auth.uid() and active)
$$;
revoke execute on function public.fluid_balance(uuid) from public, anon;
grant execute on function public.fluid_balance(uuid) to authenticated;

-- ---------- BARTHEL INDEX (physiotherapy) ----------
create or replace function public.record_barthel(p_encounter_id uuid, p_items jsonb) returns public.barthel_assessments
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.barthel_assessments; v_total integer;
begin
  v_staff := public.require_staff(array['physio','head_nurse','doctor','chief_surgeon']);
  perform public.require_open_encounter(p_encounter_id, v_staff);
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception 'Invalid Barthel score'; end if;

  select coalesce(sum(value::text::integer), 0) into v_total from jsonb_each(p_items);
  if v_total not between 0 and 100 then raise exception 'Barthel total must be between 0 and 100'; end if;

  insert into public.barthel_assessments (encounter_id, facility_id, recorded_by, items, total_score)
  values (p_encounter_id, v_staff.facility_id, v_staff.id, p_items, v_total)
  returning * into v_row;
  return v_row;
end $$;

-- ---------- NURSING / PHYSIO NOTES ----------
create or replace function public.add_care_note(
  p_encounter_id uuid, p_note_type text, p_text text, p_doc_id uuid default gen_random_uuid()
) returns public.documents
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_doc public.documents; v_roles text[];
begin
  if p_note_type = 'nursing_note' then v_roles := array['nurse','team_leader','head_nurse','doctor','chief_surgeon'];
  elsif p_note_type = 'physio_note' then v_roles := array['physio','doctor','chief_surgeon'];
  else raise exception 'Unknown note type'; end if;

  v_staff := public.require_staff(v_roles);

  select * into v_doc from public.documents where id = p_doc_id and encounter_id = p_encounter_id;
  if found then return v_doc; end if;              -- retry: already saved

  perform public.require_open_encounter(p_encounter_id, v_staff);
  if length(trim(coalesce(p_text,''))) < 2 then raise exception 'Write a note'; end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, p_note_type,
          jsonb_build_object('text', trim(p_text)), v_staff.id)
  returning * into v_doc;
  return v_doc;
end $$;

-- ---------- permissions ----------
revoke execute on function public.record_observation(uuid, integer, integer, integer, integer, integer, numeric, integer, integer, integer, text, text, text) from public, anon;
revoke execute on function public.record_circulation_check(uuid, text, text, text, numeric, text, text, boolean, boolean, text) from public, anon;
revoke execute on function public.record_fluid_event(uuid, text, numeric, text) from public, anon;
revoke execute on function public.record_barthel(uuid, jsonb) from public, anon;
revoke execute on function public.add_care_note(uuid, text, text, uuid) from public, anon;

grant execute on function public.record_observation(uuid, integer, integer, integer, integer, integer, numeric, integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.record_circulation_check(uuid, text, text, text, numeric, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.record_fluid_event(uuid, text, numeric, text) to authenticated;
grant execute on function public.record_barthel(uuid, jsonb) to authenticated;
grant execute on function public.add_care_note(uuid, text, text, uuid) to authenticated;

-- ---------- RLS ----------
alter table public.observations       enable row level security;
alter table public.circulation_checks enable row level security;
alter table public.fluid_events       enable row level security;
alter table public.barthel_assessments enable row level security;

drop policy if exists observations_read on public.observations;
create policy observations_read on public.observations for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists circulation_read on public.circulation_checks;
create policy circulation_read on public.circulation_checks for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists fluid_events_read on public.fluid_events;
create policy fluid_events_read on public.fluid_events for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists barthel_read on public.barthel_assessments;
create policy barthel_read on public.barthel_assessments for select to authenticated using (public.clinical_read_access(facility_id));
