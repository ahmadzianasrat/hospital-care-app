# Setup Guide (do this once Phase 1 is complete)

Everything is free. Total time: about 40 minutes.

If you want this in GitHub first (recommended, so nothing is ever lost), do `GITHUB.md` before step 5 below.

## 1. Supabase project
1. supabase.com > sign in > **New project**. Save the database password.
2. Wait about 2 minutes until it is ready.

## 2. Nine demo users
Authentication > Users > **Add user > Create new user**, tick **Auto Confirm User**, same password for all:
`admin@demo.test`, `headnurse@demo.test`, `chief@demo.test`, `nurse.ahmad@demo.test`, `nurse.zara@demo.test`, `doctor@demo.test`, `trainer@demo.test`, `fap.nurse@demo.test`, `kb.doctor@demo.test`

## 3. Database (SQL Editor > New query, paste the whole file, Run)
Run in this order, one file at a time. Each should say "Success":
1. `database/01_schema.sql`
2. `database/02_seed_demo.sql`
3. `database/04_changes_1B.sql`
4. `database/05_triage_opd.sql`
5. `database/07_treatment_referral.sql`
6. `database/09_wards_orders.sql`
7. `database/11_nursing_charts.sql`
8. `database/13_round_and_feedback.sql`
9. `database/15_ot_scheduling.sql`
10. `database/17_roster_training.sql`

(Steps 06, 08, 10, 12, 14, 16 and 18 are test files, covered below.)

If a file fails: copy the exact error text and send it to me. Do not re-run blindly.

## 4. Database tests (optional but recommended)
- `database/03_tests.sql`: run tests 1-9 one block at a time. Expected results are in the comments.
- `database/06_tests_1C.sql`: tests A-D. Expected: A = discharged with 2 documents; B, C, D = the error messages written in the comments.
- `database/08_tests_1D.sql`: tests E-G. Expected: E = arrived, sender FA, 0 treatments; F = 0; G = the error message in the comment.
- `database/10_tests_1F.sql`: tests H-K (wards/beds/orders/tasks). Expected results are written in the comments of each test.
- `database/12_tests_1G.sql`: tests L-O (nursing charts). Expected results are written in the comments of each test.
- `database/14_tests_1H.sql`: tests P-S (round mode, feedback, and two bug fixes found while testing this step - see "Fixed after the second round of testing" below). Expected results are written in the comments of each test.
- `database/16_tests_1I.sql`: tests T-W (OT scheduling, and two more bug fixes - see "Fixed after the third round of testing" below). Expected results are written in the comments of each test.
- `database/18_tests_1J.sql`: tests X-AA (staff roster, trainee phases, lecture conflicts, leave/cover requests). Expected results are written in the comments of each test.

## 6. App tests (optional but recommended)
Inside the `app` folder: `npm test`. Expect `17 passed`. These test the offline queue itself and need no
internet or Supabase project.

## 5. The app
1. Unzip, open the `app` folder in VS Code.
2. Copy `.env.example` to `.env`. Fill in Project URL and anon/publishable key (Project Settings > API).
3. Terminal: `npm install`, then `npm run dev`. Open http://localhost:5173

## 6. Try it (walkthrough)
| Step | Do this |
|---|---|
| 1 | Sign in as **doctor@demo.test** (on call all day, so it works at any hour) |
| 2 | Patients > **Register new patient**. Fill in the form. Note the new number (e.g. 90004HL) |
| 3 | **Send to triage now**. Open the patient in the Triage list. Fill vitals, choose a priority, choose **Send to OPD**, Save |
| 4 | OPD tab: the patient appears, most urgent first. **See this patient**, write a diagnosis, choose an outcome, Finish |
| 5 | Patients > search the number you registered, or `100001` (x-ray number of Test Patient One) |
| 6 | Sign in as **nurse.ahmad@demo.test**: works only 07:55-16:15 Kabul time; otherwise use break-glass |
| 7 | Sign in as **kb.doctor@demo.test**: sees only the Kabul patient, none from Helmand |
| 8 | Sign in as **chief@demo.test** or **headnurse@demo.test**: Home > Data access check shows all facilities |
| 9 | As **doctor@demo.test**, take a patient in OPD. Under **Quick treatment**, add "Wound dressing" + a drug. Then choose outcome **Refer out** and Finish: the referral form opens |
| 10 | Referral form: pick **KB**, a reason, Send. Look under Referrals > Sent |
| 11 | Sign in as **kb.doctor@demo.test**: Referrals tab shows a red badge. Open Incoming, check the summary (allergies, vitals, treatments), tap **Acknowledge**, then **Patient arrived: register here**. Details are pre-filled. Register. The referral shows "Registered here as ...KB" |
| 12 | Sign in as **fap.nurse@demo.test** (a first aid post): only Patients, Triage and Referrals are shown (no OPD). Register a patient, triage, and the only decision is **Refer out** |
| 13a | **Offline test 1 - reserve numbers.** As **fap.nurse@demo.test**, on Home tap **Reserve 30 more numbers**. It should say "Reserved 30 more..." and the count should go up |
| 13b | **Offline test 2 - go offline.** In Chrome DevTools (F12) > Network tab, set throttling to **Offline**. Register a new patient: it saves locally and says "Saved on this phone" |
| 13c | Go to Triage: the new patient appears with a dashed border ("Saved on this phone"). Triage them and choose Refer out: also saved locally |
| 13d | Set the Network tab back to **Online**. Within a few seconds the bar at the top says "Sending saved work…" then disappears. Refresh the page and confirm the patient and referral are now normal (solid, not dashed) |
| 13e | **Offline test 3 - rejected item.** Go offline, then as **doctor@demo.test**, try to finish an OPD visit with no diagnosis typed (this is rejected immediately by the form itself, before it ever reaches the network, so the button stays disabled and nothing is queued) |
| 13f | **Offline test 4 - the app stays usable.** While offline, watch the top of the screen: no "Could not reach the database" message should appear. Instead you should see a dark banner: "Offline: showing your status as of HH:MM" |
| 14 | **Wards.** As **doctor@demo.test**, go to Home > Wards. You'll see "Admitted, waiting for a bed" if you admitted a patient earlier (test 4/13). Tap them, pick a free bed |
| 15 | Open the ward, tap the bed: you land on the patient's ward screen. Tap **+ New order**, choose Medication, write an instruction, frequency **3 times daily**, 2 days, Save |
| 16 | Back on the patient screen, under "Tasks due" you should see today's remaining doses. Tap **Mark done** on one |
| 17 | Tap **Discharge from ward**, write a summary, confirm. The bed should now show as **Empty** on the ward board |
| 18 | As **nurse.zara@demo.test** (no shift), try to open a ward: you're off duty, so nothing to mark done - use break-glass first if you want to test this as her |
| 19 | **Nursing charts.** As **doctor@demo.test**, open an admitted patient's ward screen and tap **Charts** |
| 20 | Open **Vitals & GCS**, fill in numbers, save. It appears at the top of the table below the form |
| 21 | Open **Circulation**, pick a limb, save. Try marking "Bleeding" yes: the entry should show with a red border |
| 22 | Open **Fluid balance**. Add 500 ml IV fluid (in), then 300 ml urine (out). The 24h balance at the top should read +200 ml |
| 23 | Open **Barthel index**. Answer all 10 items, watch the running total, save, and see it appear in History |
| 24 | Open **Nursing & physio notes**. Since the doctor account can write both, switch between the two tabs and add one of each |
| 25 | Sign in as **nurse.zara@demo.test** with break-glass active, open the same patient's notes screen: she should only see the "Nursing note" option, not "Physio note" |
| 26 | **Round mode.** As **doctor@demo.test**, open a ward with at least one admitted, bedded patient and tap **Start round** |
| 27 | You should see bed number, vitals, pending/overdue tasks, circulation, fluid balance and Barthel score all on one screen. Write a round note and tap **Save & next patient** |
| 28 | After the last patient, it should say "Round complete" and return you to the ward list |
| 29 | **Feedback.** From Home, tap **Report a problem**, write something, send. As **admin@demo.test**, open the Supabase dashboard's Table Editor and check the `feedback` table: your message should be there |
| 30 | Sign in as **nurse.zara@demo.test** while off duty (no break-glass): **Report a problem** should still work, confirming feedback isn't gated by duty status |
| 31 | **OT scheduling.** As **nurse.ahmad@demo.test** (on shift), go to Home > Operating theatre. Under "Admitted, not yet booked", pick a patient and book a case: choose a theatre, urgency, diagnosis, procedure, anaesthesia, ASA class, a surgeon, and a date/time |
| 32 | Try booking a second case in the **same theatre at an overlapping time**: it should be rejected. A different theatre at the same time should work fine |
| 33 | Sign in as **doctor@demo.test**, open the booked case from the OT board, tap **Start surgery** |
| 34 | Fill in findings, procedure(s) done, outcome, and optionally a team member, then **Complete surgery**. Open the patient's ward chart afterward: a "surgery" document should now exist |
| 35 | As **nurse.zara@demo.test**, confirm she cannot see a **Start surgery** button on a scheduled case (only a doctor or chief surgeon can) |
| 36 | **Trainee programs.** As **headnurse@demo.test**, go to Home > Trainee programs, enroll **nurse.zara@demo.test** starting today, and confirm it shows "Supernumerary orientation (mornings only)" |
| 37 | Go to **Build roster**, select Zara, assign her the **morning** shift for tomorrow. Try assigning her the **night** shift the day after: it should be rejected because of her phase |
| 38 | **Publish** the week's draft shifts. As **nurse.zara@demo.test**, Home should now show the published shift under "My upcoming shifts" |
| 39 | As **trainer@demo.test**, go to Trainer tools, schedule a lecture for the Nursing Induction Program that overlaps one of Zara's published shifts |
| 40 | Back in **Build roster** as head nurse, try assigning Zara a shift at the same time as that lecture: it should be rejected |
| 41 | As the trainer, open the lecture and mark Zara **Present**. Then record an assessment for her (e.g. 65/100): it should show as passed |
| 42 | As **nurse.zara@demo.test**, from "My upcoming shifts", tap **Request a change** on her published shift, choose **Request leave**, give a reason, send |
| 43 | As **headnurse@demo.test**, go to **Roster requests**, approve it. Refresh Zara's roster: the shift should now show as "off" instead of being removed |
| 44 | Repeat with **Ask for cover** on a different shift, naming **nurse.ahmad@demo.test** as cover; approve it, and confirm the shift now belongs to Ahmad |
| 13 | Test the allergy warning: register a patient with allergy "penicillin", start a visit, triage to OPD, take the patient as a doctor, and add a treatment with drug "Penicillin V". A red warning needs a tick before you can save |

## Fixed in the test files themselves (3 Oct, second pass)
Two more real test-file bugs, both found by you actually running them (my own test harness used a
simplified mock of `auth.users` that didn't enforce the same restriction real Supabase does, so neither
of these showed up until a real Supabase project hit them):

- **"Column reference 'id' is ambiguous."** Several tests looked up a staff member with
  `select id from public.staff s join auth.users u on u.id = s.user_id where u.email = '...'` - since both
  `staff` and `auth.users` have their own `id` column, a bare `id` in the SELECT list is genuinely
  ambiguous. All of `16_tests_1I.sql` and most of `18_tests_1J.sql` used this pattern.
- **"Permission denied for table users."** More importantly: in real Supabase, the `authenticated` role is
  never granted SELECT on `auth.users` - only the SQL editor's own connection (effectively an admin role)
  can read it directly. Every test file's very first lookup (`select set_config(...) from auth.users where
  email = ...`) runs fine because it happens *before* `set local role authenticated`. But several tests in
  `16_tests_1I.sql` and `18_tests_1J.sql` also queried `auth.users` *after* switching to the authenticated
  role, to look up a second person's staff ID mid-test - and that's exactly what the authenticated role is
  correctly blocked from doing. Fixed by looking those people up through `public.staff` by name instead
  (which the `staff_read` policy already allows for anyone at the same facility), never touching
  `auth.users` again after the role switch.
- **A related structural issue, found while fixing the above:** three tests (Test V and Test W in
  `16_tests_1I.sql`, Test AA in `18_tests_1J.sql`) put an intentionally-failing statement in the *middle*
  of a transaction, with more checks after it. Once a statement errors, Postgres ignores every later
  statement in that same transaction - so those later checks were never actually running; the SQL editor
  would have shown a second, misleading "current transaction is aborted" error instead of the real result.
  Fixed by splitting each of those three tests into separate `begin;`/`rollback;` transactions, run
  back-to-back in the same paste, so every check in them is genuinely exercised.
- I've since rebuilt my own test harness to enforce the same restriction on `auth.users` that real Supabase
  does, specifically so this class of bug can't slip past my own testing again.

## Fixed in the test files themselves (3 Oct)
- **Test P (`14_tests_1H.sql`) failed with "Diagnosis is required."** This was a bug in the *test script*, not
  the app: the test passed `diagnosis: "x"` (1 character) to `complete_opd`, which correctly requires at least
  2 characters, so it failed one step before ever reaching `add_round_note` - the thing the test was actually
  meant to check. The same mistake was also sitting in two tests in `10_tests_1F.sql` and two in
  `16_tests_1I.sql`. All five are fixed to use a real diagnosis string; `add_round_note` itself was never broken.
- If you already ran the old copies and got "Diagnosis is required" on a test that wasn't supposed to be
  checking that, redownload this file and re-run the affected test. No database change is needed - only the
  test text changed.

## Fixed after the fourth round of testing (30 Sep, step 1J)
- **The whole migration file failed to re-run.** Every new Row Level Security policy was created without a
  `drop policy if exists` guard first, so running the file a second time (which `SETUP.md` always recommends as
  a safety check) failed outright with "policy already exists." Fixed by adding the guard to all nine policies,
  matching the pattern already used everywhere else in the project.
- **Re-running the file would have silently duplicated the default training program**, since there was no
  unique constraint to stop `ON CONFLICT DO NOTHING` from working, and the insert had no real way to detect it
  already existed. Fixed by checking directly with `NOT EXISTS` instead of relying on a conflict that could
  never fire.
- Both were caught immediately by testing the file twice in a row (deliberately re-running it, the same thing
  `SETUP.md` step 3 is asking you to be ready for) - not by clicking through the screens.

## Fixed after the third round of testing (30 Sep, step 1I)
- **The operative note failed to save at all.** The INSERT statement that creates the "surgery" document when
  a case is completed was missing one value (`author_id`) for one of its six columns - a copy-paste slip that
  Postgres correctly refused to run ("INSERT has more target columns than expressions"). Fixed.
- **Completing a surgery with no outcome selected was silently accepted**, instead of being rejected. The
  check compared the outcome to `not in ('alive','deceased')`, but in SQL comparing anything to nothing
  (`NULL`) never comes out true or false - it comes out "unknown", which an `IF` treats as false, so the
  guard silently let a blank outcome through. Fixed by explicitly checking for a missing value first.
- Both were caught by the automated tests in `16_tests_1I.sql`, not by using the screens - the same lesson as
  the previous round: a feature "working" in a quick click-through does not mean every edge is covered.

## Fixed after the second round of testing (30 Sep, step 1H)
- **Admin-only actions silently failed.** `mark_feedback`, and (it turns out) the bed-setup functions
  `upsert_bed`/`retire_bed` from step 1F, checked *clinical duty status* before letting an admin through - but
  "admin" was never in the list of clinical roles, so the check always failed with a misleading "off duty"
  error. Fixed: administrative actions now use a role-only check (`require_admin_staff`), not a duty check.
- **An admin could not even read the beds list**, for the same underlying reason (the `beds_read` policy
  required clinical duty). Fixed to match how `wards_read` already worked: any staff member at the facility can
  read the (patient-free) beds list.
- These were caught by the automated SQL tests in `14_tests_1H.sql` (tests R and S), not by manual clicking -
  a good example of why the test files matter even when a feature "looks fine" in the screens you happened to try.

## Fixed after the first round of testing (30 Sep)
- **"Reserve 30 more numbers" did nothing.** A logic bug meant the button silently decided it never needed to reserve more. Fixed: the button now always reserves when tapped.
- **Going offline blocked the whole app.** The screen used to show "Could not reach the database" the moment the network dropped, hiding every screen underneath it - so nothing in 13a-13e could be tested. Fixed: the app now keeps working with your last known duty status while offline (shown in a dark banner), and only shows a blocking error if it has never managed to sign you in at all.

If you already unzipped an earlier copy, replace the `app` folder with the one in this zip (or `git pull` if you're using GitHub) before re-testing.

## Free-tier notes
- Free Supabase projects pause after 7 days without use. Open the app or dashboard now and then.
- No automatic backups on the free plan. Do not put real patient data in until backups and hosting are settled.
