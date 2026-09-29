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

(Steps 06 and 08 are test files, covered below.)

If a file fails: copy the exact error text and send it to me. Do not re-run blindly.

## 4. Database tests (optional but recommended)
- `database/03_tests.sql`: run tests 1-9 one block at a time. Expected results are in the comments.
- `database/06_tests_1C.sql`: tests A-D. Expected: A = discharged with 2 documents; B, C, D = the error messages written in the comments.
- `database/08_tests_1D.sql`: tests E-G. Expected: E = arrived, sender FA, 0 treatments; F = 0; G = the error message in the comment.

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
| 13a | **Offline test 1 - reserve numbers.** As **fap.nurse@demo.test**, on Home tap **Reserve 30 more numbers** |
| 13b | **Offline test 2 - go offline.** In Chrome DevTools (F12) > Network tab, set throttling to **Offline**. Register a new patient: it saves locally and says "Saved on this phone" |
| 13c | Go to Triage: the new patient appears with a dashed border ("Saved on this phone"). Triage them and choose Refer out: also saved locally |
| 13d | Set the Network tab back to **Online**. Within a few seconds the bar at the top says "Sending saved work…" then disappears. Refresh the page and confirm the patient and referral are now normal (solid, not dashed) |
| 13e | **Offline test 3 - rejected item.** Go offline, then as **doctor@demo.test**, try to finish an OPD visit with no diagnosis typed (this actually gets rejected immediately, since it's a real business error, not a network one - confirm the error shows right away and nothing is queued) |
| 13 | Test the allergy warning: register a patient with allergy "penicillin", start a visit, triage to OPD, take the patient as a doctor, and add a treatment with drug "Penicillin V". A red warning needs a tick before you can save |

## Free-tier notes
- Free Supabase projects pause after 7 days without use. Open the app or dashboard now and then.
- No automatic backups on the free plan. Do not put real patient data in until backups and hosting are settled.
