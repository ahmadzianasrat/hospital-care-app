-- =====================================================================
-- 13: STEP 1H + PHASE 2 KICKOFF  (run AFTER 01,02,04,05,07,09,11; safe twice)
-- Round mode (a doctor-authored round note per patient) and an in-app
-- feedback tool so a pilot can report problems without leaving the app.
-- =====================================================================

alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in
  ('first_assessment','opd_note','quick_treatment','admission','surgery','addendum','ward_discharge',
   'nursing_note','physio_note','round_note'));

create or replace function public.add_round_note(
  p_encounter_id uuid, p_text text, p_doc_id uuid default gen_random_uuid()
) returns public.documents
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_doc public.documents;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_doc from public.documents where id = p_doc_id and encounter_id = p_encounter_id;
  if found then return v_doc; end if;              -- retry: already saved

  perform public.require_open_encounter(p_encounter_id, v_staff);
  if length(trim(coalesce(p_text,''))) < 2 then raise exception 'Write a round note'; end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, 'round_note', jsonb_build_object('text', trim(p_text)), v_staff.id)
  returning * into v_doc;
  return v_doc;
end $$;

revoke execute on function public.add_round_note(uuid, text, uuid) from public, anon;
grant execute on function public.add_round_note(uuid, text, uuid) to authenticated;

-- ---------- FEEDBACK (Phase 2: a pilot needs a way to report problems) ----------
-- Deliberately NOT gated by duty or clinical role: someone testing the app off-shift, or an admin
-- checking in, must still be able to report a bug. It is about the software, not a patient record.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  screen text,
  message text not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','reviewed','resolved'))
);

grant select, insert, update, delete on public.feedback to authenticated;
revoke insert, update, delete on public.feedback from authenticated;

create or replace function public.submit_feedback(p_message text, p_screen text default null) returns public.feedback
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.feedback;
begin
  select * into v_staff from public.staff where user_id = auth.uid() and active;
  if not found then raise exception 'Not a staff member' using errcode = '42501'; end if;
  if length(trim(coalesce(p_message,''))) < 3 then raise exception 'Write a short description'; end if;

  insert into public.feedback (facility_id, staff_id, screen, message)
  values (v_staff.facility_id, v_staff.id, nullif(trim(coalesce(p_screen,'')),''), trim(p_message))
  returning * into v_row;
  return v_row;
end $$;

-- BUG FIX (found in testing): upsert_bed, retire_bed and mark_feedback used require_staff(), which checks
-- CLINICAL duty status via clinical_access(). But 'admin' is not a clinical role, so clinical_access() for an
-- admin is always false, and every admin-only action silently failed with "No access: off duty" even though
-- the admin was perfectly entitled to do it. Administrative actions need a role check, not a shift check.
create or replace function public.require_admin_staff(p_roles text[]) returns public.staff
language plpgsql stable security definer set search_path = public as $$
declare v public.staff;
begin
  select * into v from public.staff where user_id = auth.uid() and active;
  if not found then raise exception 'Not a staff member' using errcode = '42501'; end if;
  if not (v.app_role = any(p_roles)) then
    raise exception 'No access: your role cannot do this' using errcode = '42501';
  end if;
  return v;
end $$;
revoke execute on function public.require_admin_staff(text[]) from public, anon;
grant execute on function public.require_admin_staff(text[]) to authenticated;

create or replace function public.upsert_bed(p_ward_id uuid, p_code text) returns public.beds
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_ward public.wards; v_bed public.beds;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  select * into v_ward from public.wards where id = p_ward_id and facility_id = v_staff.facility_id;
  if not found then raise exception 'Ward not found'; end if;

  insert into public.beds (facility_id, ward_id, code) values (v_staff.facility_id, p_ward_id, trim(p_code))
  on conflict (ward_id, code) do update set active = true
  returning * into v_bed;
  return v_bed;
end $$;

create or replace function public.retire_bed(p_bed_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  update public.beds set active = false
   where id = p_bed_id and facility_id = v_staff.facility_id
     and not exists (select 1 from public.bed_stays where bed_id = p_bed_id and to_at is null);
  if not found then raise exception 'Bed not found, or still occupied'; end if;
end $$;

create or replace function public.mark_feedback(p_id uuid, p_status text) returns public.feedback
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_row public.feedback;
begin
  v_staff := public.require_admin_staff(array['admin','head_nurse']);
  if p_status not in ('open','reviewed','resolved') then raise exception 'Invalid status'; end if;

  update public.feedback set status = p_status
   where id = p_id and facility_id = v_staff.facility_id
   returning * into v_row;
  if not found then raise exception 'Feedback not found'; end if;
  return v_row;
end $$;

revoke execute on function public.submit_feedback(text, text) from public, anon;
revoke execute on function public.mark_feedback(uuid, text) from public, anon;
grant execute on function public.submit_feedback(text, text) to authenticated;
grant execute on function public.mark_feedback(uuid, text) to authenticated;

alter table public.feedback enable row level security;

-- anyone can read their own feedback; admin/head nurse/chief surgeon/coordinator can read their facility's
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (
  staff_id = public.current_staff_id()
  or (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse','chief_surgeon','coordinator']))
);

-- BUG FIX (found in testing): beds_read only allowed on-duty clinical roles, so an admin configuring bed
-- setup could not even read the beds list. Beds carry no patient information (unlike bed_stays, which links to
-- a patient and stays clinical-only), so any staff member at the facility may read them - matching wards_read.
drop policy if exists beds_read on public.beds;
create policy beds_read on public.beds for select to authenticated using (
  facility_id = public.current_facility_id() or public.clinical_read_access(facility_id)
);
