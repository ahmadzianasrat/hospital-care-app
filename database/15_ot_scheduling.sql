-- =====================================================================
-- 15: STEP 1I - OT (SURGERY) SCHEDULING  (run AFTER 01,02,04,05,07,09; safe twice)
-- Operating theatres, booking a case, starting/completing surgery, and
-- the resulting operative note (reusing the existing 'surgery' document type).
-- =====================================================================

create table if not exists public.theatres (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  code text not null,
  name text not null,
  active boolean not null default true,
  unique (facility_id, code)
);

create table if not exists public.surgeries (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  theatre_id uuid not null references public.theatres(id),
  urgency text not null check (urgency in ('emergency','elective')),
  diagnosis text not null,
  planned_procedure text not null,
  anaesthesia_type text not null check (anaesthesia_type in ('general','spinal','sedation','local')),
  asa_class text not null check (asa_class in ('I','II','III','IV','V')),
  surgeon_id uuid not null references public.staff(id),
  team jsonb not null default '[]'::jsonb,             -- [{"role":"2nd surgeon","name":"..."}]
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  cancel_reason text,
  findings text,
  procedures_done text,
  outcome text check (outcome in ('alive','deceased')),
  booked_by uuid not null references public.staff(id),
  booked_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index if not exists surgeries_theatre_idx on public.surgeries (theatre_id, status, scheduled_start);
create index if not exists surgeries_encounter_idx on public.surgeries (encounter_id);

-- new tables created after the original blanket grant in 01_schema.sql need their own grant.
grant select, insert, update, delete on public.theatres, public.surgeries to authenticated;
revoke insert, update, delete on public.theatres  from authenticated;
revoke insert, update, delete on public.surgeries from authenticated;

-- ---------- BOOK A CASE ----------
create or replace function public.book_surgery(
  p_encounter_id uuid, p_theatre_id uuid, p_urgency text, p_diagnosis text, p_planned_procedure text,
  p_anaesthesia_type text, p_asa_class text, p_scheduled_start timestamptz, p_scheduled_end timestamptz,
  p_surgeon_id uuid, p_team jsonb default '[]'::jsonb, p_id uuid default gen_random_uuid()
) returns public.surgeries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_surgeon public.staff; v_row public.surgeries;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_row from public.surgeries where id = p_id and facility_id = v_staff.facility_id;
  if found then return v_row; end if;              -- retry: already saved

  if p_scheduled_end <= p_scheduled_start then raise exception 'End time must be after the start time'; end if;
  if length(trim(coalesce(p_diagnosis,''))) < 2 then raise exception 'Enter a diagnosis'; end if;
  if length(trim(coalesce(p_planned_procedure,''))) < 2 then raise exception 'Enter the planned procedure'; end if;

  perform public.require_open_encounter(p_encounter_id, v_staff);

  select * into v_surgeon from public.staff
   where id = p_surgeon_id and facility_id = v_staff.facility_id and active and app_role in ('doctor','chief_surgeon');
  if not found then raise exception 'Choose a surgeon (doctor or chief surgeon) at this facility'; end if;

  perform 1 from public.theatres where id = p_theatre_id and facility_id = v_staff.facility_id and active;
  if not found then raise exception 'Theatre not found'; end if;

  if exists (select 1 from public.surgeries
             where theatre_id = p_theatre_id and status = 'in_progress') then
    raise exception 'That theatre has a case in progress. Choose another theatre or wait.';
  end if;
  if exists (select 1 from public.surgeries
             where theatre_id = p_theatre_id and status = 'scheduled'
               and p_scheduled_start < scheduled_end and p_scheduled_end > scheduled_start) then
    raise exception 'That theatre is already booked for an overlapping time';
  end if;

  insert into public.surgeries (id, encounter_id, facility_id, theatre_id, urgency, diagnosis, planned_procedure,
    anaesthesia_type, asa_class, surgeon_id, team, scheduled_start, scheduled_end, booked_by)
  values (p_id, p_encounter_id, v_staff.facility_id, p_theatre_id, p_urgency, trim(p_diagnosis), trim(p_planned_procedure),
    p_anaesthesia_type, p_asa_class, p_surgeon_id, coalesce(p_team, '[]'::jsonb), p_scheduled_start, p_scheduled_end, v_staff.id)
  returning * into v_row;
  return v_row;
end $$;

-- ---------- RESCHEDULE / CANCEL ----------
create or replace function public.reschedule_surgery(p_id uuid, p_new_start timestamptz, p_new_end timestamptz)
returns public.surgeries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.surgeries;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);
  if p_new_end <= p_new_start then raise exception 'End time must be after the start time'; end if;

  select * into v_row from public.surgeries where id = p_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_row.status <> 'scheduled' then raise exception 'Only a scheduled case can be rescheduled (status: %)', v_row.status; end if;

  if exists (select 1 from public.surgeries
             where theatre_id = v_row.theatre_id and status = 'scheduled' and id <> p_id
               and p_new_start < scheduled_end and p_new_end > scheduled_start) then
    raise exception 'That theatre is already booked for an overlapping time';
  end if;

  update public.surgeries set scheduled_start = p_new_start, scheduled_end = p_new_end
   where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.cancel_surgery(p_id uuid, p_reason text) returns public.surgeries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.surgeries;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason'; end if;

  select * into v_row from public.surgeries where id = p_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_row.status <> 'scheduled' then raise exception 'Only a scheduled case can be cancelled (status: %)', v_row.status; end if;

  update public.surgeries set status = 'cancelled', cancel_reason = trim(p_reason)
   where id = p_id returning * into v_row;
  return v_row;
end $$;

-- ---------- START / COMPLETE (clinical act: surgeons only) ----------
create or replace function public.start_surgery(p_id uuid) returns public.surgeries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.surgeries;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_row from public.surgeries where id = p_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_row.status = 'in_progress' then return v_row; end if;              -- safe retry
  if v_row.status <> 'scheduled' then raise exception 'This case is % , not scheduled', v_row.status; end if;

  update public.surgeries set status = 'in_progress', actual_start = now() where id = p_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.complete_surgery(
  p_id uuid, p_findings text, p_procedures_done text, p_outcome text, p_team jsonb, p_doc_id uuid default gen_random_uuid()
) returns public.surgeries
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.surgeries;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_row from public.surgeries where id = p_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Case not found'; end if;
  if v_row.status = 'completed' then return v_row; end if;              -- safe retry
  if v_row.status <> 'in_progress' then raise exception 'This case is %, not in progress', v_row.status; end if;
  if length(trim(coalesce(p_findings,''))) < 2 then raise exception 'Describe the findings'; end if;
  if length(trim(coalesce(p_procedures_done,''))) < 2 then raise exception 'Describe the procedure(s) done'; end if;
  if p_outcome is null or p_outcome not in ('alive','deceased') then raise exception 'Record the outcome'; end if;

  update public.surgeries set status = 'completed', actual_end = now(),
    findings = trim(p_findings), procedures_done = trim(p_procedures_done), outcome = p_outcome,
    team = coalesce(p_team, team)
   where id = p_id returning * into v_row;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, v_row.encounter_id, v_staff.facility_id, 'surgery', jsonb_build_object(
    'urgency', v_row.urgency, 'diagnosis', v_row.diagnosis, 'planned_procedure', v_row.planned_procedure,
    'anaesthesia_type', v_row.anaesthesia_type, 'asa_class', v_row.asa_class,
    'findings', v_row.findings, 'procedures_done', v_row.procedures_done, 'outcome', v_row.outcome,
    'team', v_row.team, 'actual_start', v_row.actual_start, 'actual_end', v_row.actual_end), v_staff.id)
  on conflict (id) do nothing;

  return v_row;
end $$;

-- ---------- permissions ----------
revoke execute on function public.book_surgery(uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, uuid, jsonb, uuid) from public, anon;
revoke execute on function public.reschedule_surgery(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.cancel_surgery(uuid, text) from public, anon;
revoke execute on function public.start_surgery(uuid) from public, anon;
revoke execute on function public.complete_surgery(uuid, text, text, text, jsonb, uuid) from public, anon;

grant execute on function public.book_surgery(uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, uuid, jsonb, uuid) to authenticated;
grant execute on function public.reschedule_surgery(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_surgery(uuid, text) to authenticated;
grant execute on function public.start_surgery(uuid) to authenticated;
grant execute on function public.complete_surgery(uuid, text, text, text, jsonb, uuid) to authenticated;

-- ---------- RLS ----------
alter table public.theatres  enable row level security;
alter table public.surgeries enable row level security;

-- theatres carry no patient information, so any staff at the facility may read them (matches wards_read/beds_read)
drop policy if exists theatres_read on public.theatres;
create policy theatres_read on public.theatres for select to authenticated using (
  facility_id = public.current_facility_id() or public.clinical_read_access(facility_id)
);
-- surgeries are patient-linked, so they follow the same clinical-access rule as bed_stays/orders/tasks
drop policy if exists surgeries_read on public.surgeries;
create policy surgeries_read on public.surgeries for select to authenticated using (public.clinical_read_access(facility_id));

-- ---------- seed two theatres for the demo hospitals ----------
insert into public.theatres (facility_id, code, name)
select f.id, t.code, t.name
from public.facilities f
cross join (values ('OT1','Theatre 1'),('OT2','Theatre 2')) as t(code, name)
where f.type = 'hospital'
on conflict (facility_id, code) do nothing;
