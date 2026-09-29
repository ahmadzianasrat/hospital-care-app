-- =====================================================================
-- PHASE 1A: DATABASE SCHEMA  (run once, on an EMPTY Supabase project)
-- Features: multi-facility, patient IDs (seq + facility code), encounters,
-- append-only documents, referrals, audit log, role-based access,
-- duty-based access (roster + 15 min grace), break-glass override.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- FACILITIES ----------
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),   -- e.g. HL
  name text not null,
  type text not null check (type in ('hospital','fap')),
  enabled_modules text[] not null default '{}',
  timezone text not null default 'Asia/Kabul',
  created_at timestamptz not null default now()
);

-- one running number per facility (offline sites can reserve blocks)
create table public.patient_counters (
  facility_id uuid primary key references public.facilities(id),
  last_seq integer not null default 0
);

create function public.init_patient_counter() returns trigger
language plpgsql as $$
begin
  insert into public.patient_counters(facility_id) values (new.id);
  return new;
end $$;
create trigger facilities_init_counter after insert on public.facilities
  for each row execute function public.init_patient_counter();

-- ---------- STAFF ----------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  facility_id uuid not null references public.facilities(id),
  full_name text not null,
  profession text not null check (profession in
    ('doctor','nurse','physio','midwife','trainee_nurse','lab_tech','radiographer','trainer','cleaner','admin_staff')),
  app_role text not null check (app_role in
    ('admin','chief_surgeon','head_nurse','team_leader','doctor','nurse','physio','midwife',
     'lab','radiology','trainer','trainee','cleaner','coordinator')),
  employee_no text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  code text not null,
  name text not null,
  unique (facility_id, code)
);

-- ---------- ROSTER (minimum needed for duty-based access) ----------
create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  code text not null,
  name text not null,
  start_time time,
  end_time time,                       -- end < start means it crosses midnight
  counts_as_duty boolean not null default true,
  unique (facility_id, code)
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  ward_id uuid references public.wards(id),
  shift_type_id uuid not null references public.shift_types(id),
  work_date date not null,
  status text not null default 'draft' check (status in ('draft','published')),
  version integer not null default 1,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  unique (staff_id, work_date, shift_type_id)
);
create index roster_staff_date_idx on public.roster_entries (staff_id, work_date);

create table public.on_call_windows (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  check (ends_at > starts_at)
);

create table public.break_glass_events (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  staff_id uuid not null references public.staff(id),
  reason text not null check (length(trim(reason)) >= 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ---------- PATIENTS ----------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  facility_code text not null references public.facilities(code),
  seq integer not null,
  display_id text generated always as (seq::text || facility_code) stored,   -- 31397HL
  full_name text not null,
  father_name text,
  sex text not null check (sex in ('male','female')),
  date_of_birth date,
  age_years integer check (age_years between 0 and 120),
  phone text,
  district text,
  blood_group text not null default 'Unknown'
    check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown')),
  allergy_status text not null default 'unknown' check (allergy_status in ('unknown','none','known')),
  allergy_details text,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seq, facility_code),
  check (allergy_status <> 'known' or allergy_details is not null)
);
create index patients_name_idx on public.patients (lower(full_name));
create index patients_display_idx on public.patients (display_id);

-- radiology 6-digit numbers, lab numbers, etc.
create table public.external_identifiers (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  facility_id uuid not null references public.facilities(id),
  system text not null check (system in ('radiology','lab','other')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (facility_id, system, value),
  check (system <> 'radiology' or value ~ '^[0-9]{6}$')
);
create index ext_id_value_idx on public.external_identifiers (value);

-- ---------- ENCOUNTERS (one visit) ----------
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id),
  facility_id uuid not null references public.facilities(id),
  status text not null default 'waiting_triage' check (status in
    ('waiting_triage','waiting_opd','in_opd','admitted','referred_out','discharged','closed')),
  arrived_at timestamptz not null default now(),
  triage_priority text check (triage_priority in ('red','orange','yellow','green')),
  triage_decision text check (triage_decision in ('opd','refer')),
  triaged_by uuid references public.staff(id),
  triaged_at timestamptz,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1          -- optimistic locking
);
create index encounters_queue_idx on public.encounters (facility_id, status, arrived_at);

-- ---------- DOCUMENTS (append-only) ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  doc_type text not null check (doc_type in
    ('first_assessment','opd_note','quick_treatment','admission','surgery','addendum')),
  data jsonb not null default '{}'::jsonb,
  addendum_of uuid references public.documents(id),
  author_id uuid not null references public.staff(id),
  created_at timestamptz not null default now()
);
create index documents_encounter_idx on public.documents (encounter_id, created_at);

-- ---------- REFERRALS ----------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  from_facility_id uuid not null references public.facilities(id),
  to_facility_id uuid references public.facilities(id),
  to_external text,
  reason text not null,
  eta timestamptz,
  payload jsonb not null default '{}'::jsonb,     -- snapshot: vitals, injury, treatment given
  status text not null default 'sent' check (status in ('sent','received','arrived','cancelled')),
  created_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_facility_id is not null or to_external is not null)
);

-- ---------- AUDIT LOG ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id uuid,
  facility_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  break_glass boolean not null default false
);

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

create function public.current_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff where user_id = auth.uid() and active limit 1
$$;

create function public.current_facility_id() returns uuid
language sql stable security definer set search_path = public as $$
  select facility_id from public.staff where user_id = auth.uid() and active limit 1
$$;

create function public.has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.app_role = any(p_roles) from public.staff s where s.user_id = auth.uid() and s.active),
    false)
$$;

create function public.break_glass_active(p_staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.break_glass_events b
                 where b.staff_id = p_staff and b.expires_at > now())
$$;

-- DUTY CHECK: on a published shift (+/- 15 min), OR on-call, OR break-glass.
-- Admin, head nurse, chief surgeon, coordinator, trainer are not duty-bound.
create function public.is_on_duty(p_staff uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text; v_tz text; v_now_local timestamp;
  v_grace interval := interval '15 minutes';      -- change here to adjust grace
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
            ((r.work_date + st.start_time) - v_grace)
        and ((r.work_date + st.start_time)
              + case when st.end_time > st.start_time
                     then (st.end_time - st.start_time)
                     else (st.end_time - st.start_time) + interval '24 hours' end
              + v_grace)
  );
end $$;

-- clinical roles only, same facility, and on duty
create function public.clinical_access(p_facility uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.active and s.facility_id = p_facility
      and ( s.app_role in ('chief_surgeon','head_nurse','doctor','nurse','physio','midwife',
                           'lab','radiology','coordinator','trainee')
            or (s.app_role = 'team_leader' and s.profession in ('nurse','physio','midwife')) )
      and public.is_on_duty(s.id)
  )
$$;

create function public.can_write(p_facility uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.clinical_access(p_facility) and public.has_role(p_roles)
$$;

create function public.can_write_document(p_facility uuid, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.clinical_access(p_facility) and case p_type
    when 'first_assessment' then public.has_role(array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
    when 'quick_treatment'  then public.has_role(array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
    when 'addendum'         then public.has_role(array['nurse','team_leader','head_nurse','doctor','chief_surgeon','physio','midwife'])
    else                         public.has_role(array['doctor','chief_surgeon'])
  end
$$;

-- =====================================================================
-- RPC FUNCTIONS (called from the app)
-- =====================================================================

-- what the login screen needs to know
create function public.my_access_status()
returns table (staff_id uuid, full_name text, app_role text, facility_id uuid,
               facility_code text, on_duty boolean, break_glass_until timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, s.app_role, s.facility_id, f.code,
         public.is_on_duty(s.id),
         (select max(b.expires_at) from public.break_glass_events b
           where b.staff_id = s.id and b.expires_at > now())
  from public.staff s join public.facilities f on f.id = s.facility_id
  where s.user_id = auth.uid() and s.active
$$;

-- emergency override: reason required, lasts 2 hours, always logged
create function public.request_break_glass(p_reason text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_exp timestamptz := now() + interval '2 hours';
begin
  select * into v_staff from public.staff where user_id = auth.uid() and active;
  if not found then raise exception 'Not a staff member' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 10 then
    raise exception 'Please give a reason (at least 10 characters)';
  end if;
  insert into public.break_glass_events(facility_id, staff_id, reason, expires_at)
  values (v_staff.facility_id, v_staff.id, trim(p_reason), v_exp);
  return v_exp;
end $$;

-- register a patient; number is issued automatically (or from a reserved block)
create function public.register_patient(
  p_full_name text,
  p_sex text,
  p_father_name text default null,
  p_age_years integer default null,
  p_date_of_birth date default null,
  p_phone text default null,
  p_district text default null,
  p_blood_group text default 'Unknown',
  p_allergy_status text default 'unknown',
  p_allergy_details text default null,
  p_id uuid default gen_random_uuid(),
  p_seq integer default null
) returns public.patients
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_code text; v_seq integer; v_row public.patients; v_max integer;
begin
  select * into v_staff from public.staff where user_id = auth.uid() and active;
  if not found then raise exception 'Not a staff member' using errcode = '42501'; end if;
  if not public.can_write(v_staff.facility_id,
       array['nurse','team_leader','head_nurse','doctor','chief_surgeon']) then
    raise exception 'No access to register patients (off duty or wrong role)' using errcode = '42501';
  end if;

  -- idempotent: same client id sent twice (offline retry) returns the same row
  select * into v_row from public.patients where id = p_id and facility_id = v_staff.facility_id;
  if found then return v_row; end if;

  select code into v_code from public.facilities where id = v_staff.facility_id;

  if p_seq is null then
    update public.patient_counters c set last_seq = c.last_seq + 1
      where c.facility_id = v_staff.facility_id returning c.last_seq into v_seq;
  else
    select c.last_seq into v_max from public.patient_counters c where c.facility_id = v_staff.facility_id;
    if p_seq > v_max then raise exception 'Number % was never reserved', p_seq; end if;
    v_seq := p_seq;
  end if;

  insert into public.patients(id, facility_id, facility_code, seq, full_name, father_name, sex,
      age_years, date_of_birth, phone, district, blood_group, allergy_status, allergy_details, created_by)
  values (p_id, v_staff.facility_id, v_code, v_seq, p_full_name, p_father_name, p_sex,
      p_age_years, p_date_of_birth, p_phone, p_district, p_blood_group, p_allergy_status,
      p_allergy_details, v_staff.id)
  returning * into v_row;
  return v_row;
end $$;

-- offline sites reserve a block of numbers while online
create function public.reserve_patient_numbers(p_count integer default 100)
returns table (block_start integer, block_end integer)
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_end integer;
begin
  select * into v_staff from public.staff where user_id = auth.uid() and active;
  if not found or not public.can_write(v_staff.facility_id,
       array['nurse','team_leader','head_nurse','doctor','chief_surgeon']) then
    raise exception 'No access' using errcode = '42501';
  end if;
  if p_count < 1 or p_count > 500 then raise exception 'Count must be 1 to 500'; end if;
  update public.patient_counters c set last_seq = c.last_seq + p_count
    where c.facility_id = v_staff.facility_id returning c.last_seq into v_end;
  return query select v_end - p_count + 1, v_end;
end $$;

-- one search box: patient ID, radiology/lab number, or name (RLS applies)
create function public.search_patients(p_query text) returns setof public.patients
language sql stable as $$
  select p.* from public.patients p
  where length(trim(p_query)) >= 2
    and ( p.display_id ilike trim(p_query) || '%'
       or p.full_name ilike '%' || trim(p_query) || '%'
       or exists (select 1 from public.external_identifiers x
                  where x.patient_id = p.id and x.value = trim(p_query)) )
  order by p.created_at desc
  limit 25
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

create function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'version' then new.version := old.version + 1; end if;
  return new;
end $$;
create trigger patients_touch    before update on public.patients    for each row execute function public.touch_row();
create trigger encounters_touch  before update on public.encounters  for each row execute function public.touch_row();
create trigger referrals_touch   before update on public.referrals   for each row execute function public.touch_row();

create function public.block_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Records in % are append-only. Add an addendum instead.', tg_table_name;
end $$;
create trigger documents_append_only before update or delete on public.documents
  for each row execute function public.block_mutation();
create trigger audit_append_only before update or delete on public.audit_log
  for each row execute function public.block_mutation();

create function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_staff uuid := public.current_staff_id();
begin
  if tg_op = 'INSERT' then v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then v_new := to_jsonb(new); v_old := to_jsonb(old);
  else v_old := to_jsonb(old); end if;
  v_row := coalesce(v_new, v_old);
  insert into public.audit_log(staff_id, facility_id, action, table_name, record_id, old_data, new_data, break_glass)
  values (v_staff, nullif(v_row->>'facility_id','')::uuid, tg_op, tg_table_name, v_row->>'id',
          v_old, v_new, coalesce(public.break_glass_active(v_staff), false));
  return null;
end $$;

create trigger audit_patients   after insert or update or delete on public.patients            for each row execute function public.audit_trigger();
create trigger audit_encounters after insert or update or delete on public.encounters          for each row execute function public.audit_trigger();
create trigger audit_documents  after insert or update or delete on public.documents           for each row execute function public.audit_trigger();
create trigger audit_referrals  after insert or update or delete on public.referrals           for each row execute function public.audit_trigger();
create trigger audit_staff      after insert or update or delete on public.staff               for each row execute function public.audit_trigger();
create trigger audit_roster     after insert or update or delete on public.roster_entries      for each row execute function public.audit_trigger();
create trigger audit_extids     after insert or update or delete on public.external_identifiers for each row execute function public.audit_trigger();
create trigger audit_glass      after insert on public.break_glass_events                      for each row execute function public.audit_trigger();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table public.facilities          enable row level security;
alter table public.patient_counters    enable row level security;
alter table public.staff               enable row level security;
alter table public.wards               enable row level security;
alter table public.shift_types         enable row level security;
alter table public.roster_entries      enable row level security;
alter table public.on_call_windows     enable row level security;
alter table public.break_glass_events  enable row level security;
alter table public.patients            enable row level security;
alter table public.external_identifiers enable row level security;
alter table public.encounters          enable row level security;
alter table public.documents           enable row level security;
alter table public.referrals           enable row level security;
alter table public.audit_log           enable row level security;

-- facilities: any staff can read (needed for referrals); changes via dashboard only
create policy facilities_read on public.facilities for select to authenticated
  using (public.current_staff_id() is not null);

-- staff directory: same facility
create policy staff_read  on public.staff for select to authenticated
  using (facility_id = public.current_facility_id());
create policy staff_admin on public.staff for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin']));

create policy wards_read on public.wards for select to authenticated
  using (facility_id = public.current_facility_id());
create policy wards_admin on public.wards for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));

create policy shifts_read on public.shift_types for select to authenticated
  using (facility_id = public.current_facility_id());
create policy shifts_admin on public.shift_types for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));

-- roster: everyone sees own facility's roster (even off duty, to see next shift)
create policy roster_read on public.roster_entries for select to authenticated
  using (facility_id = public.current_facility_id());
create policy roster_write on public.roster_entries for insert to authenticated
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));
create policy roster_update on public.roster_entries for update to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse']));
create policy roster_delete_draft on public.roster_entries for delete to authenticated
  using (status = 'draft' and facility_id = public.current_facility_id()
         and public.has_role(array['admin','head_nurse']));

create policy oncall_read on public.on_call_windows for select to authenticated
  using (facility_id = public.current_facility_id());
create policy oncall_write on public.on_call_windows for all to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse','chief_surgeon']))
  with check (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse','chief_surgeon']));

-- break glass: own events, or management of the same facility (inserts only via RPC)
create policy glass_read on public.break_glass_events for select to authenticated
  using (staff_id = public.current_staff_id()
         or (facility_id = public.current_facility_id() and public.has_role(array['admin','head_nurse'])));

-- patients (insert only via register_patient)
create policy patients_read on public.patients for select to authenticated
  using (public.clinical_access(facility_id));
create policy patients_update on public.patients for update to authenticated
  using (public.can_write(facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon']))
  with check (public.can_write(facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon']));

create policy extid_read on public.external_identifiers for select to authenticated
  using (public.clinical_access(facility_id));
create policy extid_insert on public.external_identifiers for insert to authenticated
  with check (public.can_write(facility_id,
    array['nurse','team_leader','head_nurse','doctor','chief_surgeon','radiology','lab']));

-- encounters
create policy enc_read on public.encounters for select to authenticated
  using (public.clinical_access(facility_id));
create policy enc_insert on public.encounters for insert to authenticated
  with check (public.can_write(facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
              and created_by = public.current_staff_id());
create policy enc_update on public.encounters for update to authenticated
  using (public.can_write(facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon']))
  with check (public.can_write(facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon']));

-- documents: read + insert only (append-only)
create policy docs_read on public.documents for select to authenticated
  using (public.clinical_access(facility_id));
create policy docs_insert on public.documents for insert to authenticated
  with check (public.can_write_document(facility_id, doc_type)
              and author_id = public.current_staff_id()
              and exists (select 1 from public.encounters e
                          where e.id = encounter_id and e.facility_id = documents.facility_id));

-- referrals: sender and receiver both see it
create policy ref_read on public.referrals for select to authenticated
  using (public.clinical_access(from_facility_id)
         or (to_facility_id is not null and public.clinical_access(to_facility_id)));
create policy ref_insert on public.referrals for insert to authenticated
  with check (public.can_write(from_facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
              and created_by = public.current_staff_id());
create policy ref_update on public.referrals for update to authenticated
  using (public.can_write(from_facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
         or (to_facility_id is not null and
             public.can_write(to_facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])))
  with check (public.can_write(from_facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])
         or (to_facility_id is not null and
             public.can_write(to_facility_id, array['nurse','team_leader','head_nurse','doctor','chief_surgeon'])));

-- audit log: admin only, read only
create policy audit_read on public.audit_log for select to authenticated
  using (facility_id = public.current_facility_id() and public.has_role(array['admin']));

-- =====================================================================
-- GRANTS (be explicit; anonymous users get nothing)
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant delete on public.roster_entries to authenticated;
revoke insert, update on public.audit_log from authenticated;
revoke insert on public.patients from authenticated;
revoke insert on public.break_glass_events from authenticated;
revoke update on public.documents from authenticated;
grant execute on all functions in schema public to authenticated;
