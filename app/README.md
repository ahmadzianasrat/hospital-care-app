# Hospital Care App (Phase 1 complete: 1A-1N; live on Vercel; Phase 2 underway)

Screens: login, duty status, break-glass, patient registration, triage, OPD, referrals, an offline queue, wards,
nursing charts, a dedicated medication list, round mode, in-app feedback (+ review inbox), OT scheduling, staff
roster with month auto-generation + nursing trainee programs, ward staffing minimums, a reporting dashboard
with CSV export, a printable paper fallback, a mass casualty board, a cross-facility switcher, QR wristbands
with scan-to-find, and a donor/ministry report.

Full setup steps, including GitHub, are in `../docs/SETUP.md` and `../docs/GITHUB.md`. The pilot playbook is
`../docs/PILOT_PLAN.md`.

## Run it locally
1. Copy `.env.example` to `.env` and fill in your Supabase URL and anon/publishable key (never the service_role / secret key).
2. `npm install`
3. `npm run dev`, then open the address it prints (usually http://localhost:5173).

## Run the automated tests
`npm test` runs the offline-engine tests (18 checks). Everything with a database component is tested in the
numbered SQL files under `../database/`.

## Step 1N: medication list + roster automation + ward staffing
Three real gaps found during the first hands-on pass of the deployed app:
- `src/components/MedicationList.tsx`: a dedicated medication administration record, no database change needed
- `src/components/RosterBuilder.tsx` (extended): "Generate a whole month" fills the Morning → Night → Sleep →
  Off cycle, continuing from each person's last cycle shift automatically, or an explicit starting point;
  five new leave types (paid/unpaid/maternity/national holiday/study); any day still changeable by hand after
- `src/components/WardStaffing.tsx`, `ManageWards.tsx`: set a ward's minimum staff per shift, see a weekly
  overview flagged red when short, and add a new ward (like Sub-ICU) from inside the app
- Database: `database/21_roster_automation.sql`, tested in `database/22_tests_1N.sql`
- One real bug found and fixed: `generate_series(date, date, interval)` actually returns `timestamp` in
  Postgres, not `date`, which didn't match the function's declared return type

## Step 1M: multi-facility rollout enabler + polish
- `src/components/FacilitySwitcher.tsx`, `FeedbackReview.tsx`, `Wristband.tsx`, `ScanPatient.tsx`, `DonorReport.tsx`

## Step 1L: printable paper fallback + mass casualty board
- `src/components/PrintChart.tsx`, `MassCasualtyBoard.tsx`

## Step 1K: reports & dashboard
- `src/components/Dashboard.tsx` · Database: `database/19_reports.sql`, tested in `database/20_tests_1K.sql`

## Step 1J: staff roster + nursing trainee programs
- `src/components/RosterRequests.tsx`, `Roster.tsx`, `TraineePrograms.tsx`, `TrainerHub.tsx`, `LectureAttendance.tsx`
- Database: `database/17_roster_training.sql`, tested in `database/18_tests_1J.sql`

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

## A note on test-file quality (read this if a test ever looks wrong)
Several real bugs have been found in the numbered SQL test files themselves (not the app) over the course of
this project, all found by actually running the files against Supabase. If a test ever gives an unexpected
error, paste it back.

## How offline works, in short
- Every action that changes data goes through `src/lib/offline/engine.ts`. A network failure saves it in the
  browser's storage (`idb-keyval`) instead of losing it, and sends it automatically once you're back online.
- **Known limit:** most modules built from step 1D onward are online-only, since they involve real-time
  coordination between several people. This is revisited in Phase 3 once local-server hosting is decided.

## Files worth knowing
- `src/lib/offline/engine.ts` + `engine.test.ts`: the offline queue, fully unit-tested
- `src/hooks.ts` (`useAccessStatus`): the duty-status check that tolerates being offline
- `src/components/Workspace.tsx`: tabs, module switching per facility type
