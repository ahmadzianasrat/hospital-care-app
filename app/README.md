# Hospital Care App (Phase 1 complete: 1A-1J; Phase 2 underway)

Screens: login, duty status, break-glass, patient registration, triage, OPD, referrals, an offline queue, wards
(bed board, orders, tasks, ward discharge), nursing charts, round mode, in-app feedback, OT scheduling, and now
a staff roster builder with the full nursing trainee induction program.

Full setup steps, including GitHub, are in `../docs/SETUP.md` and `../docs/GITHUB.md`. The pilot playbook is
`../docs/PILOT_PLAN.md`.

## Run it locally
1. Copy `.env.example` to `.env` and fill in your Supabase URL and anon/publishable key (never the service_role / secret key).
2. `npm install`
3. `npm run dev`, then open the address it prints (usually http://localhost:5173).

## Run the automated tests
`npm test` runs the offline-engine tests (18 checks). All other business logic (roster, trainee programs, OT
scheduling, and everything in earlier steps) is tested separately in the numbered SQL files under `../database/`.

## Step 1J: staff roster + nursing trainee programs
- `src/components/RosterBuilder.tsx`: admin/head nurse assigns shifts one day at a time, publishes a week
- `src/components/RosterRequests.tsx`: approve/deny leave and cover requests
- `src/components/Roster.tsx`: a staff member's own upcoming shifts, with a "Request a change" action
- `src/components/TraineePrograms.tsx`: enroll a trainee, see their current phase
- `src/components/TrainerHub.tsx`, `LectureAttendance.tsx`: schedule lectures, mark attendance, record scores
- Database: `database/17_roster_training.sql`, tested in `database/18_tests_1J.sql`
- **Two bugs were found and fixed by re-running the migration file a second time** (exactly what `SETUP.md`
  recommends doing): missing `drop policy if exists` guards, and a seed insert that could have silently
  duplicated the default program on a second run. See `../docs/SETUP.md` for details.

## Step 1I: OT scheduling
- `src/components/OTBoard.tsx`, `BookSurgery.tsx`, `SurgeryDetail.tsx`
- Database: `database/15_ot_scheduling.sql`, tested in `database/16_tests_1I.sql`

## Step 1H + Phase 2 kickoff
- `src/components/RoundMode.tsx`, `FeedbackForm.tsx`
- Database: `database/13_round_and_feedback.sql`, tested in `database/14_tests_1H.sql`

## Step 1G: nursing charts
- `src/components/WardCharts.tsx`, `VitalsChart.tsx`, `CirculationChart.tsx`, `FluidBalance.tsx`, `Barthel.tsx`, `CareNotes.tsx`
- Database: `database/11_nursing_charts.sql`, tested in `database/12_tests_1G.sql`

## Step 1F: wards, beds and orders
- `src/components/WardList.tsx`, `WardBoard.tsx`, `AssignBed.tsx`, `OrderForm.tsx`, `WardPatient.tsx`
- Database: `database/09_wards_orders.sql`, tested in `database/10_tests_1F.sql`

## How offline works, in short
- Every action that changes data (register a patient, start a visit, complete triage, send a referral) goes
  through `src/lib/offline/engine.ts`. A network failure saves it in the browser's storage (`idb-keyval`)
  instead of losing it, and sends it automatically once you're back online, in order.
- **Known limit:** OPD claiming, quick treatment, wards/orders, nursing charts, round mode, feedback, OT
  scheduling, and the roster/trainee tools are all online-only for now, since most involve real-time
  coordination between several people. This is revisited in Phase 3 once local-server hosting is decided.

## Files worth knowing
- `src/lib/offline/engine.ts` + `engine.test.ts`: the offline queue, fully unit-tested
- `src/lib/offline/context.tsx`, `useEncounterView.ts`: connect the engine to Supabase and merge server/local state
- `src/hooks.ts` (`useAccessStatus`): the duty-status check that tolerates being offline
- `src/components/SyncBar.tsx`, `Outbox.tsx`, `OfflineReady.tsx`: the offline UI
- `src/components/Workspace.tsx`: tabs, module switching per facility type
