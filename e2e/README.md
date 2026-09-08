# End-to-end tests (Playwright)

Runs against the **live** stack (real Supabase + Zoho), because that's what we
actually ship. The safety rules below are what make that acceptable.

```bash
npm run test:e2e            # everything (~1.2 min)
npm run test:e2e -- --project=desktop      # one viewport
npm run test:e2e -- smoke                  # one suite
npm run test:e2e:ui         # interactive runner
npm run test:e2e:report     # open the last HTML report
```

## Safety rules

These are not conventions — they're the reason it's safe to point this at
production:

1. **Everything created is prefixed `[E2E]`.** `e2eName()` in `helpers.ts` is the
   only way tests name things.
2. **Cleanup deletes only prefixed rows**, and runs in `afterAll` even when a
   test fails. It refuses to run if the prefix is missing or shorter than 4
   chars, so it can never turn into a broad delete.
3. **Tests never touch pre-existing data** — no editing or deleting anything a
   human made.
4. **No automated Zoho _writes_.** That means the push buttons **and** the
   "Import from Zoho" / "link a deal" flows, which now advance the deal to
   *Discovery*. Writes hit a CRM with ~900 real deals and permanently mark a
   quote as pushed. Zoho *reads* are fine to test.
5. **Serial only** (`workers: 1`). Parallel runs would fight over shared live data.

## Login

A dedicated account, not a human's:

```bash
npm run e2e:seed-user     # create or reset e2e.bot@example.com
```

It prints credentials to put in `.env.local` (gitignored) as `E2E_EMAIL` /
`E2E_PASSWORD`. `auth.setup.ts` signs in once and saves the session to
`e2e/.auth/user.json`; every other project reuses it. Delete the account any
time via Team → deactivate → delete.

## Suites

| File | What it covers | Writes? |
| --- | --- | --- |
| `auth.setup.ts` | Signs in once, saves the session | no |
| `smoke.spec.ts` | All 10 routes render, no console errors, no sideways scroll | no |
| `responsive.spec.ts` | The three layout tiers + calendar/timeline width | no |
| `create-project.spec.ts` | Create a project → appears instantly → survives reload | **yes** (cleaned up) |
| `won-stage.spec.ts` | The rule that decides whether a PO may be created | no |
| `zoho-guards.spec.ts` | Auth + stage-push guards (no-op pushes only) | no |

Smoke and responsive run at **1280 / 768 / 375**. The write test runs **once**,
on desktop — it exercises data flow, not layout, so repeating it per viewport
would just triple the writes.

## Gotchas worth knowing

- **Wait for hydration before touching a form.** Until React hydrates, a form is
  plain HTML and clicking submit does a native GET — which sent the login
  password into the URL the first time. `auth.setup.ts` waits for React's
  `__react*` keys on the form, and asserts the URL never contains `password=`.
- **Expected headings aren't nav labels.** `/dashboard` renders "Welcome back,
  <name>" and `/workload` renders "Resource allocation" for a manager.
- **On the icon rail, nav links stay visible** (they're the icons) and keep their
  accessible name via `title`. To assert labels are hidden, check the sidebar's
  rendered `innerText`, not the link's visibility.

## Checking the PBS won-stage gate (not automated, on purpose)

`POST /api/pbs/pos` refuses to bill a deal that is not won. Asserting that
automatically means asking a **live billing system** to create a PO and trusting
it to refuse — and **PBS has no delete endpoint**, so one regression leaves a
real PO to unpick by hand. `zoho-guards.spec.ts` deliberately stops short of it.

### A no-op push must be proven BEFORE it is sent

`zoho-guards.spec.ts` only pushes stages a deal is **already at**, which is what
makes it safe to run against live Zoho. That safety depends on reading the
deal's stage first (`GET /api/zoho/deals/stages`) and skipping, never on
inspecting the push response — a push carrying `explicit=1` is the status-changer
path and may move a deal **backwards**, so by the time the response says "it was
at Closed Won" the deal is at Discovery. That is a real incident, not a
hypothetical: a suite run dragged a live won deal back to the start of the
pipeline.

For the same reason no id is hardcoded here. The quote/deal pair is resolved at
run time by `linkedQuote()` in `helpers.ts`; a baked-in id stops existing the
first time someone deletes that estimate, and the guards then pass by returning
404 instead of the refusal they were written to prove.

Check it in a sandbox instead. Point PBS at a dead port, so a leaked gate still
cannot create anything, then assert the refusal:

```bash
# one dev server at a time — Next 16 refuses a second for the same directory
PBS_BASE_URL="http://127.0.0.1:9/api" npx next dev
```

```
POST /api/pbs/pos  { proposalId: <a quote whose deal is NOT won>, name: "gate check", clientId: "1" }
expect 409  This deal is at "<stage>". A PO is only created once it reaches Closed Won.
```

A PBS connection error instead of that 409 means the gate leaked — the request
got as far as PBS. The gate reads the deal's stage **live** and fails closed, so
a Zoho outage gives 502, never a PO.
