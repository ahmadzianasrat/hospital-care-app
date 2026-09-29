# Hospital Care App (Phase 1, complete: 1A-1E)

Screens: login, duty status, break-glass, patient search and registration, triage, OPD queue and visit with quick
treatment, referrals (incoming, sent, to send), and an offline queue that saves work on the phone and sends it once
the connection is back.

Full setup steps, including GitHub, are in `../docs/SETUP.md` and `../docs/GITHUB.md`.

## Run it locally
1. Copy `.env.example` to `.env` and fill in your Supabase URL and anon/publishable key (never the service_role / secret key).
2. `npm install`
3. `npm run dev`, then open the address it prints (usually http://localhost:5173).

## Run the automated tests
`npm test` runs the offline-engine tests (17 checks: queueing, syncing in order, network vs. rejected errors,
off-duty handling, retry/discard, reserved patient numbers).

## How offline works, in short
- Every action that changes data (register a patient, start a visit, complete triage, send a referral) goes
  through `src/lib/offline/engine.ts`. If the request fails because of the network, or the app is already offline,
  it is saved in the browser's storage (`idb-keyval`) instead of being lost.
- A small bar (`SyncBar.tsx`) shows when you're offline and sends the saved queue automatically once you're back
  online, in the order the actions were done.
- A "wrong role or off duty" response is treated differently from a network problem: it is kept and retried
  later (e.g. once your shift starts), not discarded.
- A genuine rejection from the database (like a missing diagnosis) is never silently retried; it is shown so you
  can fix it and try again from the Outbox screen (Home > "items saved on this phone").
- Patient numbers: a facility can reserve a block of numbers while it has signal (Home > "Reserve 30 more
  numbers"), so registration still works offline. Numbers are never reused.
- Known limits of this prototype: OPD claiming and quick treatment still require a connection, since they
  involve two people coordinating over the same patient in real time. Full offline coverage of the ward
  workflow is a Phase 3 decision once we know whether facilities get a local server.

## Files worth knowing
- `src/lib/offline/engine.ts` + `engine.test.ts`: the queue itself, fully unit-tested, no Supabase needed to test it
- `src/lib/offline/context.tsx`: connects the engine to Supabase and to the browser's storage
- `src/lib/offline/useEncounterView.ts`: shows a visit whether it's on the server or only on this phone
- `src/components/SyncBar.tsx`, `Outbox.tsx`, `OfflineReady.tsx`: the offline UI
- `src/components/Workspace.tsx`: tabs, module switching per facility type
