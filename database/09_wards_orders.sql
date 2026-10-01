-- =====================================================================
-- 09: STEP 1F  (run AFTER 01, 02, 04, 05, 07; safe to run twice)
-- Wards, beds, orders and the tasks they generate, ward discharge.
-- =====================================================================

create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  ward_id uuid not null references public.wards(id),
  code text not null,
  active boolean not null default true,
  unique (ward_id, code)
);

create table if not exists public.bed_stays (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  patient_id uuid not null references public.patients(id),
  facility_id uuid not null references public.facilities(id),
  bed_id uuid not null references public.beds(id),
  from_at timestamptz not null default now(),
  to_at timestamptz,
  assigned_by uuid not null references public.staff(id)
);
-- a bed can only hold one open stay at a time
create unique index if not exists bed_stays_one_open on public.bed_stays (bed_id) where to_at is null;
-- an encounter can only have one open stay at a time (must transfer, not duplicate)
create unique index if not exists bed_stays_one_open_per_encounter on public.bed_stays (encounter_id) where to_at is null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  order_type text not null check (order_type in
    ('medication','iv_fluid','diet','mobilization','xray','lab','physio','device','discharge_plan','other')),
  details jsonb not null default '{}'::jsonb,
  frequency text not null default 'once' check (frequency in ('once','stat','od','bid','tid','qid','continuous')),
  duration_days integer not null default 1 check (duration_days between 1 and 30),
  status text not null default 'active' check (status in ('active','stopped','completed')),
  ordered_by uuid not null references public.staff(id),
  ordered_at timestamptz not null default now(),
  stopped_by uuid references public.staff(id),
  stopped_at timestamptz
);
create index if not exists orders_encounter_idx on public.orders (encounter_id, status);

-- one task = one dose/check that should happen at a specific time
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  encounter_id uuid not null references public.encounters(id),
  facility_id uuid not null references public.facilities(id),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  done_by uuid references public.staff(id),
  done_at timestamptz,
  note text
);
create index if not exists tasks_due_idx on public.tasks (facility_id, status, due_at);
create index if not exists tasks_encounter_idx on public.tasks (encounter_id, due_at);

-- documents already append-only; add the ward discharge note type
alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in
  ('first_assessment','opd_note','quick_treatment','admission','surgery','addendum','ward_discharge'));

-- new tables created after the original blanket grant in 01_schema.sql need their own grant.
-- Reads are controlled by RLS policies below; writes go only through the functions in this file.
grant select, insert, update, delete on public.beds, public.bed_stays, public.orders, public.tasks to authenticated;
revoke insert, update, delete on public.orders     from authenticated;
revoke insert, update, delete on public.tasks      from authenticated;
revoke insert, update, delete on public.bed_stays  from authenticated;
revoke insert, update, delete on public.beds       from authenticated;

-- ---------- BEDS (admin / head nurse set these up) ----------
create or replace function public.upsert_bed(p_ward_id uuid, p_code text) returns public.beds
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_ward public.wards; v_bed public.beds;
begin
  v_staff := public.require_staff(array['admin','head_nurse']);
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
  v_staff := public.require_staff(array['admin','head_nurse']);
  update public.beds set active = false
   where id = p_bed_id and facility_id = v_staff.facility_id
     and not exists (select 1 from public.bed_stays where bed_id = p_bed_id and to_at is null);
  if not found then raise exception 'Bed not found, or still occupied'; end if;
end $$;

-- ---------- ASSIGN / TRANSFER / FREE A BED ----------
create or replace function public.assign_bed(p_encounter_id uuid, p_bed_id uuid) returns public.bed_stays
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters; v_bed public.beds; v_stay public.bed_stays;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_enc from public.encounters where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;
  if v_enc.status <> 'admitted' then raise exception 'This visit is not admitted (status: %)', v_enc.status; end if;

  select * into v_bed from public.beds where id = p_bed_id and facility_id = v_staff.facility_id and active;
  if not found then raise exception 'Bed not found'; end if;

  if exists (select 1 from public.bed_stays where encounter_id = p_encounter_id and to_at is null) then
    raise exception 'This patient already has a bed. Transfer instead of assigning again.';
  end if;
  if exists (select 1 from public.bed_stays where bed_id = p_bed_id and to_at is null) then
    raise exception 'That bed is already occupied';
  end if;

  insert into public.bed_stays (encounter_id, patient_id, facility_id, bed_id, assigned_by)
  values (p_encounter_id, v_enc.patient_id, v_staff.facility_id, p_bed_id, v_staff.id)
  returning * into v_stay;
  return v_stay;
end $$;

create or replace function public.transfer_bed(p_encounter_id uuid, p_new_bed_id uuid) returns public.bed_stays
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_new public.beds; v_stay public.bed_stays;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','doctor','chief_surgeon']);

  select * into v_new from public.beds where id = p_new_bed_id and facility_id = v_staff.facility_id and active;
  if not found then raise exception 'Bed not found'; end if;
  if exists (select 1 from public.bed_stays where bed_id = p_new_bed_id and to_at is null) then
    raise exception 'That bed is already occupied';
  end if;

  update public.bed_stays set to_at = now()
   where encounter_id = p_encounter_id and facility_id = v_staff.facility_id and to_at is null;
  if not found then raise exception 'This patient does not currently have a bed'; end if;

  insert into public.bed_stays (encounter_id, patient_id, facility_id, bed_id, assigned_by)
  select p_encounter_id, patient_id, v_staff.facility_id, p_new_bed_id, v_staff.id
  from public.encounters where id = p_encounter_id
  returning * into v_stay;
  return v_stay;
end $$;

-- ---------- ORDERS + the tasks they generate ----------
-- Times of day for each frequency. Change here if a facility's routine differs.
create or replace function public.frequency_times(p_frequency text) returns time[]
language sql immutable as $$
  select case p_frequency
    when 'od' then array['08:00']::time[]
    when 'bid' then array['08:00','20:00']::time[]
    when 'tid' then array['08:00','14:00','20:00']::time[]
    when 'qid' then array['06:00','12:00','18:00','24:00']::time[]
    else array[]::time[]  -- once / stat / continuous: no repeating schedule
  end
$$;

create or replace function public.create_order(
  p_encounter_id uuid,
  p_order_type text,
  p_details jsonb,
  p_frequency text default 'once',
  p_duration_days integer default 1,
  p_id uuid default gen_random_uuid()
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff; v_enc public.encounters; v_order public.orders;
  v_times time[]; v_day integer; v_t time; v_due timestamptz; v_tz text;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_order from public.orders where id = p_id and facility_id = v_staff.facility_id;
  if found then return v_order; end if;              -- retry: already saved

  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'Invalid order details'; end if;
  if length(trim(coalesce(p_details->>'instruction',''))) < 2 then raise exception 'Describe the order'; end if;

  select * into v_enc from public.encounters where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;
  if v_enc.status not in ('admitted','waiting_opd','in_opd') then
    raise exception 'Orders can only be written for an admitted or OPD visit (status: %)', v_enc.status;
  end if;

  insert into public.orders (id, encounter_id, facility_id, order_type, details, frequency, duration_days, ordered_by)
  values (p_id, p_encounter_id, v_staff.facility_id, p_order_type, p_details, p_frequency,
          greatest(1, least(30, p_duration_days)), v_staff.id)
  returning * into v_order;

  select f.timezone into v_tz from public.facilities f where f.id = v_staff.facility_id;
  v_times := public.frequency_times(p_frequency);

  if p_frequency in ('stat','once') then
    insert into public.tasks (order_id, encounter_id, facility_id, due_at) values (v_order.id, p_encounter_id, v_staff.facility_id, now());
  elsif array_length(v_times, 1) > 0 then
    for v_day in 0 .. v_order.duration_days - 1 loop
      foreach v_t in array v_times loop
        v_due := (((now() at time zone v_tz)::date + v_day) + v_t) at time zone v_tz;
        if v_due >= now() - interval '1 hour' then  -- skip slots already well in the past today
          insert into public.tasks (order_id, encounter_id, facility_id, due_at)
          values (v_order.id, p_encounter_id, v_staff.facility_id, v_due);
        end if;
      end loop;
    end loop;
  end if;
  -- 'continuous' orders (e.g. an IV running at a set rate) generate no timed tasks; they show as an
  -- active order that nursing checks as part of routine rounds, not a per-dose tick.

  return v_order;
end $$;

create or replace function public.stop_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_order public.orders;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_order from public.orders where id = p_order_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'active' then return v_order; end if;

  update public.orders set status = 'stopped', stopped_by = v_staff.id, stopped_at = now()
   where id = p_order_id returning * into v_order;
  update public.tasks set status = 'skipped', note = 'Order stopped'
   where order_id = p_order_id and status = 'pending' and due_at > now();
  return v_order;
end $$;

-- ---------- TASKS (nursing / physio execute them) ----------
create or replace function public.complete_task(p_task_id uuid, p_note text default null) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_task public.tasks;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','physio','midwife','doctor','chief_surgeon']);

  select * into v_task from public.tasks where id = p_task_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.status = 'done' then return v_task; end if;              -- retry: already done
  if v_task.status = 'skipped' then raise exception 'This task was skipped (the order may have been stopped)'; end if;

  update public.tasks set status = 'done', done_by = v_staff.id, done_at = now(), note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_task_id returning * into v_task;
  return v_task;
end $$;

create or replace function public.skip_task(p_task_id uuid, p_reason text) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_task public.tasks;
begin
  v_staff := public.require_staff(array['nurse','team_leader','head_nurse','physio','midwife','doctor','chief_surgeon']);
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason'; end if;

  select * into v_task from public.tasks where id = p_task_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.status <> 'pending' then return v_task; end if;

  update public.tasks set status = 'skipped', done_by = v_staff.id, done_at = now(), note = trim(p_reason)
   where id = p_task_id returning * into v_task;
  return v_task;
end $$;

-- ---------- WARD DISCHARGE ----------
create or replace function public.discharge_from_ward(
  p_encounter_id uuid, p_data jsonb, p_doc_id uuid default gen_random_uuid()
) returns public.encounters
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff; v_enc public.encounters;
begin
  v_staff := public.require_staff(array['doctor','chief_surgeon']);

  select * into v_enc from public.encounters where id = p_encounter_id and facility_id = v_staff.facility_id for update;
  if not found then raise exception 'Visit not found'; end if;

  if exists (select 1 from public.documents where id = p_doc_id and encounter_id = p_encounter_id) then
    return v_enc;
  end if;
  if v_enc.status <> 'admitted' then raise exception 'This visit is not admitted (status: %)', v_enc.status; end if;
  if p_data is null or length(trim(coalesce(p_data->>'summary',''))) < 2 then
    raise exception 'Give a discharge summary';
  end if;

  insert into public.documents (id, encounter_id, facility_id, doc_type, data, author_id)
  values (p_doc_id, p_encounter_id, v_staff.facility_id, 'ward_discharge', p_data, v_staff.id);

  update public.bed_stays set to_at = now() where encounter_id = p_encounter_id and to_at is null;
  update public.orders set status = 'stopped', stopped_by = v_staff.id, stopped_at = now()
   where encounter_id = p_encounter_id and status = 'active';
  update public.tasks set status = 'skipped', note = 'Patient discharged'
   where encounter_id = p_encounter_id and status = 'pending';

  update public.encounters set status = 'discharged', outcome_at = now() where id = p_encounter_id returning * into v_enc;
  return v_enc;
end $$;

-- ---------- permissions ----------
revoke execute on function public.upsert_bed(uuid, text) from public, anon;
revoke execute on function public.retire_bed(uuid) from public, anon;
revoke execute on function public.assign_bed(uuid, uuid) from public, anon;
revoke execute on function public.transfer_bed(uuid, uuid) from public, anon;
revoke execute on function public.create_order(uuid, text, jsonb, text, integer, uuid) from public, anon;
revoke execute on function public.stop_order(uuid) from public, anon;
revoke execute on function public.complete_task(uuid, text) from public, anon;
revoke execute on function public.skip_task(uuid, text) from public, anon;
revoke execute on function public.discharge_from_ward(uuid, jsonb, uuid) from public, anon;

grant execute on function public.upsert_bed(uuid, text) to authenticated;
grant execute on function public.retire_bed(uuid) to authenticated;
grant execute on function public.assign_bed(uuid, uuid) to authenticated;
grant execute on function public.transfer_bed(uuid, uuid) to authenticated;
grant execute on function public.create_order(uuid, text, jsonb, text, integer, uuid) to authenticated;
grant execute on function public.stop_order(uuid) to authenticated;
grant execute on function public.complete_task(uuid, text) to authenticated;
grant execute on function public.skip_task(uuid, text) to authenticated;
grant execute on function public.discharge_from_ward(uuid, jsonb, uuid) to authenticated;

-- ---------- RLS ----------
alter table public.beds      enable row level security;
alter table public.bed_stays enable row level security;
alter table public.orders    enable row level security;
alter table public.tasks     enable row level security;

drop policy if exists beds_read on public.beds;
create policy beds_read on public.beds for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists bed_stays_read on public.bed_stays;
create policy bed_stays_read on public.bed_stays for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (public.clinical_read_access(facility_id));
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (public.clinical_read_access(facility_id));

-- ---------- seed a few beds for the demo wards ----------
insert into public.beds (facility_id, ward_id, code)
select w.facility_id, w.id, b.code
from public.wards w
cross join (values ('1'),('2'),('3'),('4')) as b(code)
where w.code in ('ALPHA','BRAVO','FEMALE')
on conflict (ward_id, code) do nothing;
