# Phase 2 Pilot Plan

This is the playbook for turning the finished Phase 1 build into a real pilot. Nothing here needs the hospital's
approval to start — the first two sections are things you can do alone or with one or two trusted colleagues
before you ever ask for official sign-off.

## Before approaching anyone officially

1. **Re-read `PROJECT_SCOPE.md` section 7 (Ground rules) and the NDA/IP item in your own to-do list.** Do this
   again now, since a pilot means real people, even if not yet real patients.
2. **Dry-run it yourself end to end**, using the fake demo data, following every step in `SETUP.md` including the
   offline and ward tests. You should be able to register a patient, triage them, see a doctor, get admitted,
   have a full ward stay charted, go through a round, and get discharged, without hitting an error.
3. **Show 2-3 people you trust** (a nurse, a doctor, the head nurse, informally) using the demo data only. Watch
   them use it without helping unless they're stuck. Where they hesitate or ask "what do I do here?" is more
   useful than what they say afterward.
4. **Use the in-app feedback button yourself** ("Report a problem" on Home) every time something feels slow,
   confusing, or wrong, so you build the habit before asking others to.

## Getting a real pilot approved

5. Identify the one decision-maker who can say yes to a small, contained trial (see `TODO.md` Phase 0).
6. Propose the **smallest possible pilot**: one area (triage, or one ward), a small number of staff, a fixed
   time window (2-4 weeks), and paper running in parallel the entire time. Do not propose replacing paper yet.
7. Agree in writing (even a short email) on: what area, which staff, for how long, that paper stays the record
   of truth during the pilot, and who to contact if something goes wrong.

## Running the pilot

- **Week 1:** shadow every shift if you can. Fix anything that blocks someone from finishing a task the same
  day if possible. Check the feedback inbox (Home > Report a problem, or ask an admin/head-nurse login to check
  `feedback` — a simple review screen for that list is a good next build once the pilot starts).
- **Weeks 2 onward:** move to a daily check-in of the feedback list, plus a 15-minute conversation with the
  pilot staff at the end of each week.
- **Timing:** ask pilot staff, roughly, "did this feel faster or slower than paper?" after the first week. If
  something specific feels slow, time it yourself with a stopwatch against the paper equivalent.
- **Every fix**: note what changed, so `TODO.md`'s "always" list (test backup restores, keep a changelog) stays
  honest.

## Gate to move past the pilot

- Staff keep using it without being told to.
- No safety incident traced to the software (a missed allergy warning, a lost order, and so on).
- At least one full patient journey — triage through ward discharge — has gone through the app with a real
  patient, correctly, with paper as the backup record.

## What "Phase 2" adds to the software itself

Two small things ship with this round so a pilot can actually run:

- **In-app feedback** (`Home > Report a problem`): any staff member, even off duty, can describe a problem.
  Only they, and admin/head nurse/chief surgeon/coordinator at their facility, can see it.
- **Round mode** (`Wards > open a ward with patients > Start round`): walks through every bedded, admitted
  patient in order, showing the latest vitals, pending/overdue tasks, circulation, fluid balance, and Barthel
  score in one screen, with a place for the doctor to leave a round note.

## Not yet built (fair to say no to, for now)

- A screen for reviewing the feedback list (right now it's readable only via the Supabase dashboard's table
  view — ask if you want a proper in-app screen for this before the pilot starts).
- Any analytics or timing dashboard. Timing is manual (a stopwatch and a conversation) for this pilot.
- Multi-facility rollout (Kabul, Panjshir, FAPs) — that is Phase 5, after a successful single-facility pilot.
