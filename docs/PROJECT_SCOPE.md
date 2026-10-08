# Hospital Care Platform: Project Scope

> Working name: **TBD** (choose your own name and branding; do not reuse any EMERGENCY logo, layout, or wording.)

## 1. What it is

An offline-tolerant, multi-facility web app (PWA) that digitizes the patient journey in a trauma and surgical hospital: triage, OPD, admission, surgery, ward rounds, nursing and physio charting, and staff rosters including nursing trainee programs.

It is built for hospitals with unreliable power and internet, and it scales from a full hospital down to a small first aid post (FAP) with the same codebase.

## 2. Who it is for

| Facility type | Modules enabled |
|---|---|
| Hospital (e.g. Lashkar-Gah, Kabul, Panjshir) | Everything |
| FAP (first aid post) | Triage, quick treatment, referral only (phone-first) |

Users: triage nurses, OPD doctors, surgeons, ward nurses, physiotherapists, midwives, lab, radiology, head nurse, team leaders, chief surgeon, coordinators, admins, nursing trainees, and trainers (who own the induction schedule, separate from the head nurse and team leaders).

## 3. The end product

1. **Patient registry:** unique ID `seq + facility_code` (e.g. `31397HL`), stored as two fields with a unique pair. Returning patients keep their number. Radiology 6-digit numbers and other department numbers are stored as external identifiers, so one search box finds a patient by either.
2. **Visit flow (encounters):** Triage (nurse) -> refer out, or OPD (doctor) -> quick treatment / refer / admit -> surgery or ward -> outcome or discharge.
3. **Documents:** First Assessment, Hospital Admission, Surgery (with post-op orders), each with author and timestamp, mirroring the current paper flow with your own design.
4. **Orders and tasks engine:** doctors write orders (medication, IV, diet, mobilization, x-ray, lab, physio, devices, discharge). Orders generate dated tasks for nurses and physios, who tick them off with name and time.
5. **Ward and bed board:** beds with status colors and alert icons (NPO, isolation, fall risk, pending results).
6. **Charting:** vitals, circulation, GCS (adult and pediatric), intake/output with auto fluid balance, devices with removal alerts, Barthel index. 24-hour grid plus trend charts.
7. **Notes:** doctor, nursing, and physio notes. Append-only, corrections as addendums.
8. **Round mode:** per patient: auto-generated nurse summary, physio summary, then doctor order entry, confirmed once.
9. **Referrals between facilities:** the receiving site sees a snapshot built by the database from the real chart (demographics, allergies, blood group, triage vitals, injury, diagnosis, treatments given, transport, expected arrival) before the patient arrives. The receiving site acknowledges it, and registering the arriving patient (pre-filled) links the two records. Referrals to facilities outside the system are supported by name. A cancelled referral can be replaced. Only the sending and receiving facilities (and chief surgeon, coordinator, head nurse) can see a referral.
10. **Staff and roster:** rosters by ward and profession, draft/publish/versioning, swaps and leave, conflict warnings.
11. **Nursing trainee programs:** ~15-month program with phases (supernumerary mornings-only for the first 3-4 months), lecture sessions with attendance, assessments and exams, calendar blocking. **Ownership split:** the head nurse places trainees in wards; trainers set the induction schedule (lectures, assessments, exams). Trainer lectures automatically block the trainee's ward time.
12. **Roles and permissions:** role + scope (facility, ward, team). Clinical access is separate from roster access.
    - **Duty-based access:** clinical staff can only use the system while on a published shift, from 5 minutes before the shift to 15 minutes after it ends. On-call doctors are covered by on-call windows. Admin, head nurse, chief surgeon, coordinator and trainer are not duty-bound. Enforced in the database, not just at login.
    - **Facility isolation:** staff can only access patient data of their own facility, doctors included. Exception, read-only across all facilities: chief surgeon, hospital/medical coordinator, head nurse. The only other cross-facility sharing is the referral snapshot a sending facility deliberately sends to the receiving facility.
    - **Break-glass override:** anyone with a clinical role can enter a reason (10+ characters) to get 2 hours of access outside their shift. Always logged and visible to the head nurse and admin.
    - **Multiple simultaneous users:** unlimited per ward. Every action is stamped with the person, notes are append-only, tasks are ticked individually, and orders use version checks.
13. **Reports and dashboards:** per facility and central (admissions, injury types, outcomes, length of stay), exportable.
14. **Paper fallback:** print the observation and doctor files from the app for downtime.

### Paid add-ons (later)
Pharmacy and stock, blood bank, OT scheduling and surgical checklists, mass-casualty board, donor and ministry reports, barcode/QR wristbands.

## 4. Tech stack

- **Database and backend:** Supabase (PostgreSQL, Auth, Row Level Security, Realtime, Storage, Edge Functions)
- **Frontend:** React + TypeScript + Vite, installable PWA, Tailwind CSS
- **Offline:** service worker plus a local store (IndexedDB) with a queued sync layer. A sync engine such as PowerSync works with Supabase; decide in Phase 1 after a prototype.
- **Local sites:** evaluate a self-hosted Supabase on a small server per hospital that syncs to a central instance, versus cloud-only with strong client-side offline. This is the biggest open architecture decision.
- **Security:** RLS on every table, `facility_id` on every record, audit log table, encryption in transit and at rest, short auto-logout with PIN.

## 5. Core data model (overview)

- `facilities` (code, type, enabled_modules)
- `patients` (seq, facility_code, name, father_name, sex, dob/age, allergies, blood_group), unique (seq, facility_code)
- `external_identifiers` (patient_id, system, value)
- `encounters` (patient, facility, status, timestamps) and `documents` (encounter, type, data JSONB, author, created_at)
- `orders`, `tasks`, `observations`, `intake_output`, `devices`, `notes`, `bed_stays`, `beds`, `wards`
- `staff`, `assignments`, `shift_types`, `roster_entries`
- `training_programs`, `program_phases`, `enrollments`, `lecture_sessions`, `assessments`
- `profiles`, `roles`, `audit_log`

## 6. Phases

| Phase | Scope | Gate |
|---|---|---|
| 0 | Groundwork: approval, NDA/IP check, workflow re-shadowing | Someone with authority agrees to a pilot |
| 1 | Foundation: Supabase schema, auth, roles, RLS, PWA shell, triage, OPD queue, quick treatment, referral (fake data), offline prototype | Demo faster than paper |
| 2 | Pilot 1: triage and OPD, x-ray/lab linking, timing and feedback | Staff choose to keep using it |
| 3 | Wards: bed board, orders-to-tasks, charts, notes, round mode, admission/surgery/discharge, print fallback | A round runs without slowing down |
| 4 | Staff: roster, swaps, leave, trainee programs | Head nurse builds a real roster in the app |
| 5 | Multi-facility: central dashboard, referrals, Kabul/Panjshir, FAP lite, Dari/Pashto, add-ons | Second facility live |

## 7. Ground rules

- **Fake data only** for development and demos. No real patient records.
- Own design, own branding, own wording.
- Append-only clinical notes; audit every write.
- Never slower than paper on a busy night; time every screen.
- Allergies and blood group are required or explicitly "Unknown".

## 8. Out of scope (for now)

Billing/insurance, full pharmacy ERP, full HR/payroll, PACS image storage, integrations with government systems.

## 9. Success criteria

- Triage entry under 60 seconds.
- Zero data loss across offline/online transitions.
- A ward round completed from the app in no more time than paper.
- Staff adoption: voluntary use after the pilot.

## 10. Key risks

No approval from HQ, sync bugs, slower than paper, long support obligations, data hosting and ownership disputes, security context in Afghanistan.

## Wards and orders (step 1F)

- **Bed board:** each ward shows its beds, who's in them, and how many tasks are due or overdue. Admitted
  patients with no bed yet show in a clear "waiting for a bed" list.
- **Orders:** a doctor writes an order (medication, IV, diet, mobilization, x-ray, lab, physio, device, or
  other) with a frequency (once, STAT, daily, twice daily, 3x, 4x, or continuous) and a duration. The database
  generates the individual dated tasks automatically (e.g. 3x daily for 2 days = 6 tasks).
  "Continuous" orders (like a running IV) create no timed tasks; they show as an active order nursing checks
  during routine rounds instead.
- **Tasks:** nurses (and physios, midwives) mark each task done or skipped (with a reason) at the bedside.
  Stopping an order cancels its remaining future tasks.
  Only a doctor or chief surgeon can write or stop an order; only a doctor or chief surgeon can discharge a
  patient from the ward, which frees the bed, stops active orders, and cancels pending tasks.
- **Not yet included (next increments):** the detailed nursing charts from the paper file (vitals grid,
  circulation chart, GCS chart, fluid balance/intake-output, physio notes, Barthel index) and the full
  multidisciplinary "round mode" screen. Wards and orders currently require a connection (not yet part of the
  offline queue) - see the note below.

## Nursing charts (step 1G)

- **Vitals & GCS:** blood pressure, pulse, respiratory rate, oxygen saturation, temperature, and the Glasgow
  Coma Scale (eyes/verbal/motor), plus pupils. Shock index and the GCS total are calculated automatically. A
  note reminds staff to apply the pediatric response guide for patients under 2; the same 1-5/1-4/1-6 scale is
  used underneath either way.
- **Circulation:** per-limb movement, sensation, capillary refill, temperature, colour, and bleeding/oozing
  flags - matching the hourly circulation paper. A bleeding entry is highlighted.
- **Fluid balance:** intake (IV fluid, blood products, oral) and output (urine, stool, vomitus, drains,
  insensible loss) logged as they happen; the database keeps a running balance for the whole stay and for the
  last 24 hours.
- **Barthel index:** the standard 10-item independence score (0-100), scored by a physio (or, when none is on
  shift, a head nurse, doctor, or chief surgeon), with its history kept over time.
- **Nursing and physio notes:** free-text, timestamped, and attributed, alongside the rest of the ward
  documents. A nurse cannot write a physio note and vice versa.
- Every entry is append-only, tied to the visit and facility, and only visible with the same clinical-access and
  facility-isolation rules as the rest of the chart.
- Not yet included: a full "round mode" screen that walks through every patient in order during the
  multidisciplinary round; that is a good candidate for the next increment once this is tested.

## Medication list + roster automation + ward staffing (step 1N)

Three real gaps found during the first hands-on pass of the deployed app:

- **Medication list:** a dedicated medication administration record, separate from the mixed "active
  orders" list - every medication order with its own dosing schedule, each dose time, and who gave (or
  skipped) it. No database change was needed; this reuses the orders/tasks engine from step 1F.
- **Roster auto-generation:** a "Generate a whole month" button fills every day with the repeating
  Morning -> Night -> Sleep (the mandatory rest day right after a night shift) -> Off cycle, continuing
  automatically from wherever each person's cycle left off the previous month (so someone who was "Sleep"
  on the last day of September correctly starts October on "Off"). Someone with no roster history yet
  defaults to starting on Morning, or the head nurse can pick an explicit starting shift instead. Every
  generated day is a draft, and any single day can still be changed by hand afterward - to a different
  cycle shift, or to one of five new leave types (paid leave, unpaid leave, maternity leave, national
  holiday, study leave) - exactly the same way as before, nothing new to learn there.
- **Ward staffing minimums:** a head nurse can set how many staff a ward needs on a given shift (for
  example 2 nurses on Ward Alpha's morning shift, 4 on Sub-ICU's), and a weekly overview shows every
  ward/shift combination with how many are actually published against that minimum, in red when short.
  A new "Manage wards" screen lets admin/head nurse add a ward that doesn't exist yet (like Sub-ICU),
  since that was previously only possible by editing the database directly.
- A genuine bug was found and fixed while testing this: `ward_staffing_overview` mismatched its own
  declared return type, because `generate_series(date, date, interval)` actually returns `timestamp` in
  Postgres, not `date` - an easy trap, caught immediately by testing rather than by someone hitting it live.

## Multi-facility rollout enabler + polish (step 1M)

- **Facility switcher:** head nurse, chief surgeon, and coordinator - the roles that already have
  cross-facility read access everywhere else in this app - can now switch which facility's Wards,
  Operating Theatre, or Mass Casualty Board they are looking at, for situational awareness across sites.
  This is deliberately **view-only**: switching to another facility disables tapping through to individual
  patients or booking actions there, because every write in this app checks the signed-in staff member's
  own facility, not whichever one happens to be on screen - the switcher only changes what they can see,
  never what they can do elsewhere.
- **Feedback inbox:** admin and head nurse can now review, mark reviewed, resolve, or reopen feedback
  from inside the app (Home > Feedback inbox), instead of only through the Supabase table editor.
- **QR wristband:** a printable label with a QR code encoding only the patient's ID (nothing else - a
  lost or photographed wristband reveals no extra information), alongside their name, age, sex, blood
  group, and allergy status.
- **Scan to find a patient:** uses the browser's native camera barcode scanner where supported, with a
  type-the-ID fallback everywhere else, so it keeps working even on devices or browsers without scanning
  support.
- **Donor / ministry report:** an aggregate-only, printable version of the dashboard - same underlying
  data as step 1K's reports, but with zero patient names anywhere, so it is available to admin too
  (matching the same privacy rule as the main dashboard's CSV export).
- **None of this needed new database code.** Every piece here reuses functions, tables, and RLS policies
  already built and tested in earlier steps.

## Printable paper fallback + mass casualty board (step 1L)

- **Print paper copy:** from an admitted patient's ward screen, or any past visit in a patient's record, a
  clean black-on-white summary - demographics, allergies, triage findings, diagnosis, active orders, the last
  12 vitals readings, recent circulation checks, and recent nursing/physio notes - ready for the browser's own
  print dialog. This is a live snapshot pulled fresh each time, not a stored document, and it says so on the
  printout. Needed no new database code at all - it only reads data every other screen already reads.
- **Mass casualty board:** every patient currently in the system (waiting for triage, waiting for OPD, with a
  doctor, or admitted - everyone short of discharged/referred/closed) in one view, grouped and colour-coded by
  triage priority, refreshing every 10 seconds. Open to any clinical role, not just triage/OPD staff, since
  situational awareness during a mass-casualty event matters to lab, radiology, and physio too. Like the print
  fallback, this needed no new database code - it is a different way of looking at data the app already has.

## Reports & dashboard (step 1K)

- **Summary:** for a chosen date range, total visits, how many are currently waiting, admitted, or
  discharged, per facility - every facility you have cross-facility read access to, or just your own
  otherwise (the same rule used everywhere else in the app).
- **Triage priority and incident-type breakdowns**, **length of stay** (arrival to final discharge,
  whether that was straight from OPD or after a ward stay), **OT stats** (completed cases,
  emergency/elective split, alive/deceased), and **referral stats** (sent/received/arrived).
- **CSV export** of the underlying patient list for the same date range - but deliberately **not available
  to admin**. Admin cannot read individual patients anywhere else in this app (by design, since admin
  manages configuration, not patient care), so the dashboard keeps that same boundary: admin sees
  aggregate counts only, while head nurse, chief surgeon, and coordinator - who already have
  patient-identifying access elsewhere - can export the real list.
- A plain nurse, doctor, or physio does not see the Dashboard tile at all; this is a management-level
  view, matching who the original "reports and dashboards" scope item was written for (coordinators and
  donors).

## Staff roster + nursing trainee programs (step 1J)

- **Roster builder:** admin or head nurse picks a staff member and a week, and assigns a shift (and
  optionally a ward) one day at a time. New entries are always drafts first; **Publish** makes a week's draft
  shifts visible to everyone and enforceable for duty-based login.
- **Trainee phase enforcement:** a trainee's current phase is computed automatically from their enrollment date
  (no one updates it by hand). A phase marked "mornings only" (the first ~4 months, matching what you
  described) can only be given the morning shift - the roster builder refuses anything else, with a clear
  reason shown.
- **Lecture-conflict enforcement:** a trainer's scheduled lecture automatically blocks that time on the
  trainee's roster - trying to assign a shift that overlaps a lecture is refused, so the head nurse sees the
  conflict before it happens rather than after.
- **Lectures, attendance, and assessments:** a trainer schedules a lecture against the program, marks each
  enrolled trainee present/absent/excused afterward, and records scored assessments (after-lectures,
  intermediate, final exam) with an automatic pass/fail at 50%. A trainee can see their own scores; no one else
  can except admin, head nurse, and trainers.
- **Swap and leave requests:** any staff member can ask to take leave or have someone else cover one of their
  own *published* shifts, with a reason. Admin or head nurse approves or denies. Approving a leave marks the
  shift "off" (keeping the record, rather than deleting it); approving a cover reassigns the shift to the named
  colleague, after checking they are not already working that day.
- This is the roster/trainee system originally described in detail early in this project - it reuses the
  duty-login roster tables that have existed since Phase 1A, adding the actual building, publishing, and
  trainee-program tools on top of them.

## OT scheduling (step 1I) - first Phase 2 add-on module

- **Theatres:** a facility's operating theatres are set up like beds - a simple list, visible to any staff
  member there (no patient information in the list itself).
- **Booking a case:** from an admitted patient's ward screen, or from the OT board's "not yet booked" list, a
  nurse, team leader, head nurse, doctor, or chief surgeon books a theatre, urgency, diagnosis, planned
  procedure, anaesthesia type, ASA class, a surgeon (must be a doctor or chief surgeon at that facility), and a
  date/time. The database refuses to double-book a theatre for an overlapping time, and refuses a theatre that
  already has a case in progress.
- **Starting and completing** a case are the two genuinely clinical acts, restricted to a doctor or chief
  surgeon: starting records the actual start time; completing records findings, the procedure(s) actually done,
  the outcome, and an optional surgical team list, and automatically creates the operative note (the existing
  "surgery" document type) from that data - matching the paper Surgery form's findings/procedures/outcome/team
  fields.
- **Cancelling** a scheduled case requires a reason and is available to the same scheduling roles as booking.
- Post-operative orders (medication, diet, mobilization, and so on) reuse the existing orders/tasks engine from
  step 1F rather than duplicating it - a surgeon writes normal orders once the patient is back on the ward.

## Round mode (step 1H) - completes the original Phase 1 scope

- From a ward with admitted, bedded patients, **Start round** steps through them one at a time in bed order.
- Each stop shows the latest vitals and GCS, pending/overdue tasks, the latest circulation check, 24-hour fluid
  balance, and the latest Barthel score - everything the multidisciplinary team would otherwise be paging
  through separate papers for.
- A doctor (or chief surgeon) can leave a round note per patient, which is saved as they move to the next one;
  other roles can still step through the same view to follow along, read-only.
- "Open full chart" drops out of the round into the normal ward patient screen (for writing a new order, for
  example) and back to the ward list when done.

## Phase 2 kickoff

Two things shipped alongside round mode specifically to support a real pilot, detailed in `PILOT_PLAN.md`:

- **In-app feedback:** any staff member, even off duty, can report a problem from Home. Visible only to
  themselves and to admin/head nurse/chief surgeon/coordinator at their facility. Not yet offline-capable.
- A concrete, week-by-week pilot playbook, including what to do before ever asking the hospital for approval.

## Offline design (step 1E)

- Every write goes through one offline queue (`src/lib/offline/engine.ts`). If it fails for a network reason, or
  the app is already offline, it is saved on the device (IndexedDB) and retried automatically once online, in order.
- A response that means "you are off duty" or "wrong role" is kept and retried later, not discarded, since the
  person may simply need their shift to start or to use break-glass.
- A real rejection from the database (missing required field, patient not found) is shown immediately and never
  silently retried; the person fixes it from the Outbox screen.
- Patient numbers can be reserved in blocks ahead of time, so registration works with no signal at all.
- Not yet offline-capable: OPD claiming and quick treatment, the entire ward/orders/tasks module (step 1F), and
  the nursing charts (step 1G), since these involve real-time coordination between several people around the
  same patient. This is revisited in Phase 3 once local-server hosting is decided (see the open architecture
  question in section 4).

## 11. Decisions made

- **Quick treatment** (dressing, injection, one-time drugs) is recorded inside the OPD visit with a drug-allergy warning that needs a tick to override.

- **English only** (no Dari/Pashto, no Solar Hijri dates).
- **Supabase cloud free tier** for development; no paid subscriptions for now. Free projects pause after 7 days of inactivity and have no automatic backups.
- **Development happens in chat:** code and SQL are pasted into free tools (Supabase SQL editor, VS Code, GitHub).
- **Duty-based access** (5 minutes before a shift, 15 minutes after) **with break-glass override** (not a hard lockout). Shifts: morning 08-16, night 16-08.
- **Facility isolation:** own-facility data only; chief surgeon, coordinator and head nurse can read across facilities.
