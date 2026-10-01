# Your To-Do List

Legend: **[You]** = only you can do it. **[Claude]** = I build it when you say go.

## Now (before any building)

- [ ] **[You]** Re-read your employment contract: NDA, IP, and non-compete clauses
- [ ] **[You]** Find out who approves software: hospital coordinator, medical coordinator, or HQ in Italy
- [ ] **[You]** Decide the product name and your own branding (no EMERGENCY logo or copied layouts)
- [ ] **[You]** Create a Supabase account and a new project (free tier is fine for now)
- [ ] **[You]** Create a GitHub account/repo (private)
- [ ] **[You]** Install Node.js (LTS) and Git on your computer
- [ ] **[You]** Answer the open questions below

## Decisions made

- English only. Cloud Supabase free tier. Development in chat. Duty-based access with break-glass.
- Trainers own the induction schedule; the head nurse places trainees in wards.

## Open questions for me

1. Cloud-only, or a local server per hospital? (Default: cloud Supabase first, decide local later)
2. English UI first, Dari/Pashto later? (Default: yes)
3. Are you building solo, and how many hours per week?
4. Do you want Claude Code for coding? (recommended, since this is a multi-file project)

## Phase 0: Groundwork

- [ ] **[You]** Talk to one decision-maker (informally first)
- [ ] **[You]** List 3 people to shadow: a triage nurse, an OPD doctor, the head nurse
- [ ] **[You]** Write down the exact fields they use in triage (categories, options)
- [ ] **[You]** Write down the nursing trainee program: phases, lecture schedule, assessments
- [ ] **[You]** Agree in principle on data ownership and hosting
- [ ] **Gate:** someone with authority agrees to a pilot

## Phase 1: Foundation and demo

Steps: **1A** database (done, written) > **1B** login + duty status (done) > **1C** patients, triage, OPD queue (done) > **1D** quick treatment + referral (done) > **1E** offline queue (done) > **1F** wards, beds, orders, tasks (done) > **1G** nursing charts (done) > **1H** round mode (done) > **1I** OT scheduling (done) > **1J** staff roster + trainee programs (done). **Phase 1 scope is complete. Phase 2 (pilot) is underway - see `PILOT_PLAN.md`.** You set everything up **after Phase 1 completes**, using `SETUP.md`.

- [ ] **[You]** Follow `GITHUB.md` first (put the code in GitHub)
- [ ] **[You]** Then follow `SETUP.md` (Supabase project, 9 demo users, 5 SQL files, `npm test`, the 13-step walkthrough including offline tests 13a-13e) and send me the results

- [ ] **[Claude]** Supabase schema: facilities, patients, encounters, documents, staff, profiles, audit_log
- [ ] **[Claude]** Auth, roles, and Row Level Security policies
- [ ] **[Claude]** PWA shell (React + TypeScript + Vite)
- [ ] **[Claude]** Patient ID generator (seq + facility code) and unified search
- [ ] **[Claude]** Triage, OPD queue, quick treatment, referral
- [ ] **[Claude]** Offline queue and sync prototype
- [ ] **[Claude]** Fake-data seed script
- [ ] **[You]** Test with fake data; give feedback on every screen
- [ ] **[You]** Show the demo to 2-3 nurses and ask: faster than paper?
- [ ] **Gate:** nurses say it is faster than paper

## Phase 2: Pilot (see PILOT_PLAN.md for the full playbook)

- [ ] **[You]** Dry-run the entire app yourself end to end (PILOT_PLAN.md step 2)
- [ ] **[You]** Show 2-3 trusted colleagues using fake data only; watch, don't help unless stuck
- [ ] **[You]** Use "Report a problem" yourself for two weeks before asking anyone else to
- [ ] **[You]** Identify the one decision-maker and propose the smallest possible pilot (one area, small
      group, 2-4 weeks, paper running in parallel)
- [ ] **[You]** Once approved: run the weekly cadence in PILOT_PLAN.md, review feedback daily at first

## (Superseded) original Phase 2 draft

- [ ] **[Claude]** X-ray/lab linking (patient ID + 6-digit number)
- [ ] **[You]** Get pilot permission, hardware (tablet, UPS), and a champion nurse
- [ ] **[You]** Run beside paper; log problems weekly
- [ ] **[Claude]** Fix issues, add timing metrics
- [ ] **Gate:** staff keep using it, no safety issues

## Phase 3: Wards and orders

- [ ] **[Claude]** Bed board, orders-to-tasks engine, 24-hour charts, fluid balance
- [ ] **[Claude]** Notes, round mode, admission/surgery/discharge documents
- [ ] **[Claude]** Printable paper fallback
- [ ] **[You]** Collect sample blank forms and drug lists (blank only, no patient data)
- [ ] **[You]** Pilot in one ward with paper in parallel
- [ ] **Gate:** a round runs from the app without slowing down

## Phase 4: Staff and training

- [ ] **[Claude]** Roster, shifts, swaps, leave, warnings
- [ ] **[Claude]** Trainee programs, lectures, assessments, calendar blocking
- [ ] **[You]** Provide real program rules and minimum staffing per ward
- [ ] **Gate:** head nurse builds a real roster in the app

## Phase 5: Multi-facility

- [ ] **[Claude]** Central dashboard, cross-facility referrals, FAP lite mode
- [ ] **[Claude]** - [ ] **[You]** Pricing model and contract (per facility per month)
- [ ] **[You]** Rollout plan for Kabul and Panjshir
- [ ] **[Claude]** Add-ons: pharmacy, blood bank, OT scheduling, reports

## Always

- [ ] Use fake data only in development
- [ ] Test backup restores, not just backups
- [ ] Time every screen against paper
- [ ] Keep a changelog of what you tell the hospital
