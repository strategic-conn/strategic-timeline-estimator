# QA Checklist — click-through verification

> 🤖 **Some of this is now automated.** `npm run test:e2e` (Playwright, ~1.2 min)
> covers: all 10 routes rendering with no console errors and no sideways scroll,
> the three responsive tiers (1280 / 768 / 375), calendar + timeline width, and
> one create-project write flow with automatic cleanup. Run it first — it clears
> the mechanical checks so a human pass can focus on the flows below that
> genuinely need eyes and judgement. See [e2e/README.md](../e2e/README.md).
>
> Deliberately **not** automated: the Zoho **push** (writes to a real CRM and
> permanently marks a quote), invites/offboarding, and anything destructive.

> **Fresh full pass re-run 2026-08-17** (not just spot-checks on new work): `tsc --noEmit` clean ·
> `next build` clean · migrations `0001–0029` applied on the remote, no schema drift · assignment
> engine self-check **48/48** · ESLint **18 errors / 22 warnings — all pre-existing** (see bottom) ·
> Zoho routes still correctly gated post-reconnect · `zoho_connection` RLS canary clean · no secrets
> in the client bundle. **Everything below is what only a human can confirm.** Tick as you go; log
> failures at the bottom.

---

## 📅 Calendar views & time-off approval

> Needs a **Member** account and an **Admin/Manager** account.

**Who sees what**
- [ ] As a **Member**, open Calendar: the title reads **My calendar**, there is **no Mine/Team toggle**, and you see only your own tasks, the sprints of projects you have work on, and your own leave. No teammate's PTO, no other project's tasks.
- [ ] As **Admin/Manager**: the **Mine / Team** toggle is there and defaults to **Team**; switching to Mine narrows it exactly like the Member view.
- [ ] Hard check (not just the UI): as a Member, the app must not even receive others' leave — the `availability_entries` read policy is self-or-approver (`0034`).

**Requesting**
- [ ] As a **Member**, Settings → the button reads **Request time off** and the copy says it will be reviewed. Submit one.
- [ ] Your row shows **Awaiting approval**. Workload → Mine: your capacity is **unchanged** (a request must not reduce it).
- [ ] Calendar: those days show a **dashed amber outline**, not the solid rose tint, and the side panel says "awaiting approval".
- [ ] The approvers get a bell notification.
- [ ] As **Admin/Manager**, Settings → your own new entry is **Approved** immediately (you are the approver — no self-approval theatre).

**Deciding**
- [ ] As **Admin/Manager**, Settings → **Time-off requests** shows the queue with a "N waiting" badge, oldest first. Click **Review**.
- [ ] With **no** work due in those dates: a green "nothing scheduled falls in these dates" panel and a single **Approve** button (no reschedule offer).
- [ ] With work due in those dates: each task lists `due → new date`, and either the people who could cover it or a **No cover** warning. Sprints that can no longer finish are listed with `ends → new end`.
- [ ] **Approve only** → leave is granted, **no** dates move. Check a listed task still has its original due date.
- [ ] Re-test with **Approve + reschedule** → every listed task and sprint now matches **exactly** what the dialog showed.
- [ ] **Decline** with a note → the requester sees **Declined** plus the note, the days vanish from the calendar entirely, and their capacity is untouched.
- [ ] Once approved, the requester's Workload capacity drops and shows the `(40h − N days off)` note.

**Clickable count badges**
- [ ] Workload → Team: click a **N pending** badge → a panel lists exactly N tasks, each with project, status and due date.
- [ ] Click a row → lands on that task's sprint board (or backlog) with the task selected.
- [ ] Same for **N overdue** (red badge).
- [ ] The number on the badge and the number of rows in the panel always match.
- [ ] Keyboard: Tab to the badge, Enter opens it, Escape closes it.
- [ ] 375px: the panel stays fully on screen and scrolls inside itself — the page must not scroll sideways.
- [ ] Workload → **Mine**: the pending banner and the overdue badge behave the same way.
- [ ] Nobody with 0 pending / 0 overdue shows a badge at all.

**Workload bar & week metrics**
- [ ] Workload → Team: each person's bar is now **segmented by task status** with a legend under it (To Do grey, In Progress blue, In Review purple, Blocked red). Hover a segment → tooltip naming the status, hours and task count.
- [ ] The legend hours **sum to the Est. figure** beside it.
- [ ] Someone over capacity: the bar keeps its status colours and gains an **amber ring** — the fill must NOT turn solid amber.
- [ ] A person with no open work shows an empty track and no legend.
- [ ] The metrics row reads **Logged this wk** (not "This wk") and now also shows **Available**. Hover each → tooltips explain logged-vs-available.
- [ ] ⚠️ Available = weekly capacity − logged. Someone at 328% utilisation can still show hours available — that is correct, not a bug; utilisation is the over-allocation signal.
- [ ] Book PTO / land a holiday in the week → Available drops with capacity.
- [ ] Workload → **Mine** shows the same segmented bar and an "Xh available" line under Logged this week. The two views must not disagree.
- [ ] 375px: the legend wraps onto two lines rather than scrolling sideways.

**Schedule risk buffer**
- [ ] Estimator → **Adjust**: the "Schedule risk buffer" card sits under "Requirements not pinned down yet", with presets None / 10 / 15 / 20 / 30 and a free-text %.
- [ ] ⚠️ Set it to 20% → the **Totals** panel and the quote price do **NOT** change. Only the Timeline does. (This is the whole point — if the price moves, stop and report it.)
- [ ] Timeline tab → the header reads "N business days (incl. 20% risk buffer on M)" and the launch date is later. Every phase bar stretches; the first still starts on day 0 and no two phases overlap.
- [ ] Type 900 → clamps to 100. Type -5 → clamps to 0. Clear the field and click away → 0, not NaN.
- [ ] **Start project** with a 20% buffer → the seeded sprint dates match the buffered Timeline, and the new project's own buffer reads 20%.
- [ ] Project page → under the Timeline, the section shows **Planned finish** and **With buffer**. Changing the % moves **nothing** on the Gantt — it is a forecast.
- [ ] **Apply to sprint dates…** → the dialog lists every sprint as `old range → new range`. Cancel → nothing changed.
- [ ] Confirm → the sprints move, the Gantt reflects it, and the buffer **resets to 0%** (applying twice must not compound).
- [ ] A project with no sprints says so instead of offering to apply.
- [ ] A **Member** does not see the section at all.

**US holidays**
- [ ] Calendar → November 2026: **Wed 11th** reads "Veterans Day" and **Thu 26th** "Thanksgiving", both with a muted tint (not the rose PTO tint). Click one → the side panel explains it is excluded from timelines and capacity.
- [ ] ⚠️ July 2026: the marked day is **Fri the 3rd**, NOT Sat the 4th — the federal observance rule. Same for December 2027: **Fri the 24th**, not Sat the 25th.
- [ ] ⚠️ December 2027: **Fri the 31st** is marked "New Year's Day" (Jan 1 2028 is a Saturday).
- [ ] An estimate whose timeline spans late November → the Gantt says "**N days later — Thanksgiving**" and the launch date moves. "business days" itself does NOT change.
- [ ] Workload during Thanksgiving week → everyone's capacity reads 32h with "(40h − 1 holiday)", on **both** Mine and Team.
- [ ] Book PTO Mon–Fri of Thanksgiving week and approve it → the note reads "(40h − 4 days off − 1 holiday)", NOT 5 days off. Capacity must not go below 0.
- [ ] Start project on an estimate spanning a holiday → no seeded task is due on the holiday.

**Timeline generator respects PTO**
- [ ] Open an estimate's **Timeline** tab with nobody on leave → note the launch date. It must be unchanged from before this feature.
- [ ] Approve PTO for **one** person across a week that the timeline spans → reopen the Timeline: the launch date moves later and the header says "**N days later for booked time off**" in amber. "business days" itself must NOT change — it is the same amount of work.
- [ ] Approve PTO for the **whole team** across that week → the timeline steps over it entirely.
- [ ] A **pending** request must move nothing. Approve it → the dates move. Decline it → they move back.
- [ ] Leave booked **after** the project finishes changes nothing.
- [ ] **Start project** → Review schedule → **Next: billing** on that estimate → the pre-filled PO end date matches the reviewed schedule's last sprint (and the Gantt's launch date), not a plain business-day count.
- [ ] **Start project** → the seeded sprint dates match the Timeline tab you just looked at.

**Edges**
- [ ] Edit the **dates** of an approved request → it returns to **Awaiting approval** (nobody agreed to the new dates). Edit only the **note** → it stays approved.
- [ ] A task due on the **first** day of a 5-day absence and one due on the **last** day must BOTH land clear of it — not shifted by the same amount.
- [ ] Someone already **approved** away over the same window is not offered as cover; someone with a **pending** request still is (it may yet be refused).
- [ ] Emergency case: approve PTO starting today that overlaps an active sprint → the sprint appears in "at risk" and the Gantt reflects the new end after rescheduling.

## 🟢 Tasks ↔ Workload

> The only "I'm finished" signal is moving a task to **Done**. Use one dev
> account and one manager account, side by side, in the same week.

- [ ] Assign a task to a dev → **Workload → Team** shows it under them with a **pending** badge and its hours in `Est.` labelled `(incl. Nh pending)`.
- [ ] The dev opens **Workload → Mine**: the **same** open count, the **same** estimate, the **same** utilisation % as the manager sees. The pending task carries a `pending` badge in the list. (These two used to disagree.)
- [ ] The dev **accepts** → the pending badge clears on both pages; the numbers do not move.
- [ ] The dev **declines** → the task leaves their load entirely on both pages (the assignee row is deleted, not flagged).
- [ ] Move the task to **Done** (drag to the column) → it leaves Mine and Team immediately, open count and estimate both drop, no refresh needed.
- [ ] Move it back out of Done → it returns to both.
- [ ] Set the task to **In review** or **Blocked** → it **stays** in the workload (unfinished work must not disappear).
- [ ] Book the dev 3 days' PTO this week → **both** pages show capacity dropping to 16h with the `(40h − 3 days off)` note, and utilisation rises on both. (Mine ignored time off entirely.)
- [ ] Log hours on an accepted task → "Logged this week" updates on **both** pages without a reload. Try logging as a non-assignee → refused by the DB (`0018` trigger), not just hidden.
- [ ] Drag a card to Done, then open a **different project** → no task there has a fresh "updated" timestamp. (Board writes used to hit every task in the workspace with that status.)

## 💲 Hourly rates (Settings → Workspace)

- [ ] **Admin:** all 10 rates show as editable fields (Coordinator at $0).
      Change one, Save → "Hourly rates saved", and the footer says "Last
      changed by <you>".
- [ ] **Admin:** set a Level 2 below its Level 1 → that cell says "Level 2
      can't be below Level 1" and Save is disabled. Equal is allowed.
- [ ] **Admin:** blank, negative, `abc`, `10.555`, `10001` are refused.
- [ ] **Admin:** Reset restores the saved values without saving.
- [ ] **Admin + manager open at once:** a saved change appears on the other
      screen without a refresh — but never over an admin who is mid-edit.
- [ ] **Manager:** sees rates as text (`$120/h`), no fields, no Save, and
      "Only admins can change rates."
- [ ] **Member / viewer:** the Hourly rates card is not there at all.
- [ ] **Phone (375px), as admin:** the table fits with no sideways scroll.
- [ ] Changing a rate does NOT change any existing estimate's price.

## 📚 Catalog v3 (Estimator → Line items → Browse catalog)

- [ ] Each task shows **role · Level** (e.g. "IT · Level 2") and, where the
      workbook has one, an amber **Things to consider** note.
- [ ] Role chips (All roles / IT / Creative / QA Tester / Project Coordinator)
      and level chips (Any / Level 1 / Level 2) filter the list; the category
      rail counts and "Select all" follow the filter.
- [ ] React / Next.js: tick "CPT & Fields Setup" — only that task is selected
      (it used to tick "Database Setup & Configuration" too).
- [ ] An existing estimate's PDF / Excel shows sensible categories for catalog
      lines (e.g. Hero Section → Frontend), not "Accessibility".
- [ ] Each task shows its current rate (e.g. "$120/h").
- [ ] 375px: the filter chips wrap, nothing scrolls sideways.
- [ ] Rebuild check: `node scripts/build-catalog.mjs` prints counts matching
      the workbook's Summary tab.

## 💲 Price per line (Estimator)

- [ ] Add a catalog task → its line reads "… · IT L2 · $120/h" and shows its
      price under the hours; the header total goes up by exactly that price.
- [ ] Open a line's details → change **Role** → the rate and price follow;
      other lines don't move.
- [ ] Header says "N h at $X/h" when every line shares a rate, "avg $Y/h"
      when they don't.
- [ ] An OLD estimate (e.g. Patrick's, $70,800) still shows its old price.
      Adjust tab → "At today's rates this estimate would be …" + **Update to
      current rates**. Open the dialog and **Cancel** on real quotes — only
      press Update on a test estimate.
- [ ] On a test estimate: Update → price changes to the previewed figure; the
      card then says "Matches today's rates."
- [ ] PDF / preview / Excel: line prices add up to the total; no rate or role
      printed anywhere.
- [ ] Send to Zoho dialog: product rows add up to the header price.
- [ ] 375px: the Role picker and the Adjust card fit, nothing scrolls sideways.

## 🔑 Work keys (Team → star button)

- [ ] **Admin:** open a member's "Work keys & skills" → set IT to L2 → the row
      under their email shows "IT L2". Set QA Tester to L1 too → "IT L2 · QA
      Tester L1". "None" removes one.
- [ ] **Manager / member:** the same dialog shows the keys as text and "Only
      admins can change work keys." — no buttons.
- [ ] **Before any keys are set:** Start project assigns exactly as it did
      before (nothing changes until an admin sets keys).
- [ ] **With keys:** give one person an IT Level 2 key → on a new project, IT
      tasks go only to IT key holders; an IT Level 2 task with only Level 1
      holders shows "Nobody holds IT Level 2 — assign manually".
- [ ] Give someone a Creative key → design tasks now get assigned to them.
- [ ] Approving time off: cover suggestions for a seeded task show the key
      ("Creative L2") and never offer a lower level.
- [ ] 375px: the key buttons fit inside the dialog, nothing scrolls sideways.

## 🗓️ Catalog estimates scheduled by role (Estimator → Timeline)

- [ ] A catalog-only estimate with only IT tasks: the timeline looks exactly as
      it did before (Design/QA bars only from the add-ons).
- [ ] Add a Creative catalog task (e.g. a banner/visuals task) → a Design & UX
      bar appears (or grows), before Development; the Development bar shrinks by
      the same hours. The header total hours do not change.
- [ ] Add a QA Tester task → it shows under QA & Testing, after Development.
- [ ] Change a line's Role (line details) from IT to Creative → it moves from
      the Development bar to Design.
- [ ] Start project on that estimate → sprints Design & UX / Development /
      QA & Testing, each task in its role's sprint, **nothing in the backlog**.
- [ ] A GUIDED estimate with a Creative catalog line: Start project puts it in
      Design & UX if the questionnaire has a design phase, otherwise in
      Development — never the backlog.
- [ ] Sync schedule on an existing project: tasks already in a sprint stay
      where they are; only new tasks go to their role's sprint.
- [ ] Create PO date range matches the timeline's launch date.

## 🗂️ Stage board (Estimator → Stages)

- [ ] With many estimates in one stage (e.g. Closed Won), the board stays inside
      the screen: that column scrolls on its own, and every column header and
      total stays visible. The page itself does not get longer.
- [ ] Scroll a long column to the bottom, then keep scrolling: the page scrolls
      normally (nothing traps the scroll).
- [ ] Drag a card from far down a long column into another column: it lands.
- [ ] 375px: the board fits, the column scrolls vertically, and the board swipes sideways.

## 👥 Auto-assign counts existing work (Start project → Review schedule)

- [ ] Someone already heavily loaded (Workload shows e.g. 131h) gets later
      dates than before, and their reason says "after 131h already booked".
- [ ] **Fastest:** with two equally skilled people, the one with less existing
      work gets the task.
- [ ] **Best-fit:** the strongest person still gets it, just with later dates.
- [ ] A person with no open work is planned exactly as before.

## ⏱️ Schedule risk buffer default

- [ ] New estimate → Adjust tab: the risk buffer starts at **10%**, and the
      timeline is ~10% longer than the same work at 0%. The price is unchanged.
- [ ] New project (Projects → New project): its risk buffer section shows 10%.
- [ ] Start project from an estimate set to 20% → the project shows 20%, not 10%.
- [ ] An estimate made before this change still shows its old buffer (often 0%).

## 🧭 Onboarding tours + Getting started

`npx playwright test e2e/tours.spec.ts` runs every page's tour at 1280 / 768 /
375 as the manager bot, fails on any write during a tour, and walks the
newcomer flow with a throwaway member. The manual checks below are what it
can't see.

- [ ] **Newcomer** (invite someone new, accept, sign in): the welcome dialog
      appears on the dashboard once. *Later* brings it back next visit; *Don't
      show again* never does; *Start the tour* walks nav → bell → Add task →
      profile → the ? button.
- [ ] **Existing user**: no welcome dialog, no checklist — one "New: page
      tours" toast, once, ever.
- [ ] The ? button has a dot on a page whose tour you haven't taken; it goes
      once you finish or close that tour.
- [ ] On each page: ? → *Tour: …* → every step points at something visible,
      reads correctly for your role, and **nothing you can't do is mentioned**
      (repeat as **member** and **viewer** — the bot is a manager).
- [ ] Clicking the highlighted control during a tour does nothing. On a sprint
      board, pressing **n** mid-tour opens no dialog.
- [ ] Estimator editor: each of the 5 tabs offers its own tour (switch tab,
      reopen ?). Settings: Profile / Skills / Time off / Workspace likewise.
- [ ] 375px: the popover docks to the top or bottom edge, away from the
      highlighted element, and never covers the tab bar it is describing.
- [ ] Keyboard only: ← / → step, Esc ends, focus starts on **Next** and
      returns to the ? button afterwards. Light **and** dark mode.
- [ ] **Getting started** (newcomer, Dashboard → Mine): each item ticks itself
      after the real action (upload a photo → reload → ticked). A member with
      nothing assigned sees "Nothing assigned to you yet", greyed, and it does
      not count against progress. *Show me* lands on the right page with the
      tour on the right step. × hides it for good; ? → *Getting started
      checklist* (or Settings → Profile → *Open Getting started*) brings it back.
- [ ] Settings → Profile → *Reset all tours*: every page's dot comes back.
- [ ] Estimator editor: every section has a **?** in its top-right corner
      (Setup: Quote details · Scope & risk: summary / empty state / tentative
      timeline · Line items · Adjust: Requirements, Risk buffer, Rates, Add-ons,
      Totals · Review). Each opens on click/tap (not hover), reads correctly,
      and stays fully on screen at 375px (scrolls inside itself if short).
      The ? buttons line up down the Adjust tab's column of cards.
- [ ] Every other page: a **?** top-right of the page header, and on each main
      section (Dashboard Mine + Team, Projects, project page + timeline + risk
      buffer, the board's title box, Calendar day + legend, Timeline, Workload
      Mine + Team + weekly capacity, Team, Activity, Reports, each Settings
      tab, Estimator list). None sits on top of a header button at 375 / 768 /
      1280 (`e2e/estimator-help.spec.ts` opens them all).

## ✉️ Invites & password setup

`npx playwright test e2e/invite-setup-link.spec.ts --project=desktop` reproduces
the email-scanner bug and the way out. By hand, on the deployed app:

- [ ] Supabase → Authentication → Emails: the **Invite** and **Reset
      password** links go to `/auth/confirm?token_hash=…` (see CLAUDE.md
      "Invites & password setup"), not `{{ .ConfirmationURL }}`.
- [ ] Invite a real work address (Outlook/365): the email's link opens a page
      with **Continue**, then **Set your password**, then the dashboard.
- [ ] After inviting, the dialog shows a **backup setup link**; Copy works.
- [ ] Team → a member who never set a password → **key button** gives a link
      that works once; for someone who has a password it refuses.
- [ ] Opening `/#error=access_denied&error_code=otp_expired` lands on sign-in
      with an explanation, not on the home page.
- [ ] Signed out, `/forgot-password` opens (it used to bounce to sign-in).

## 🔐 Security probe (automated, live)

`node scripts/security-probe.mjs` — creates a throwaway `[E2E]` member, attacks
PostgREST with that member's real JWT, reads every result back with the service
key, and cleans up. **Every line must read PASS**, and the last line must say
`cleanup: clean`.

- [ ] Run it after ANY change to an RLS policy, trigger or constraint.
- [ ] P17: tour progress is self-only (a member can write its own row, and
      cannot read, insert or delete anyone else's).
- [ ] As a **member** in the UI: edit the dates of your own *approved* leave →
      it becomes pending (dashed amber on the calendar) and your capacity goes
      back up until it is re-approved.
- [ ] As a **member**: re-request a *rejected* leave → saves, shows pending.
- [ ] As a **manager**: approve it → reviewer and time are recorded.
- [ ] Dashboard Team "Overdue" = Reports "Overdue" (also asserted in
      `dashboard-views.spec.ts`).
- [ ] Hard-reload the dashboard and Reports: KPI tiles show `—` for a moment,
      never a `0` that then jumps.

## 🧱 Layout integrity (automated)

`npx playwright test e2e/layout-integrity.spec.ts` walks every page at 1280 /
768 / 375 and fails on: the document or `main` scrolling sideways, content past
`main`'s edge with no inner scroller, or two non-nested controls overlapping by
more than 4px in both axes. Run it after ANY layout change.

- [ ] Green at all three widths.
- [ ] If you add a layout assertion, **give it a negative control first** —
      inject the breakage and confirm the check fires. The first version of this
      spec passed every page while being completely inert.
- [ ] Loading states count. A skeleton that overflows without a scroller is the
      same bug as content that does — the stage board's skeleton clipped two of
      its six columns with no way to reach them.

## 📊 Dashboard — Mine / Team

- [ ] As **admin/manager**: the Mine/Team toggle is in the header and both
      scopes render. As **member/viewer**: **no toggle at all** (one scope, so a
      toggle would lie about what is available).
- [ ] Team view: one row per confirmed member, **busiest first**.
- [ ] **Cross-page:** pick a person and compare their `N% of Mh` on the
      dashboard against the same person on `/workload` — they must be
      identical. This is the check that matters most; both read
      `assignedWork` / `capacityFor` / `utilization`.
- [ ] Bar segment colours match the **board's** status dots exactly (todo grey,
      in progress blue, in review purple, blocked red). A status that is one
      colour here and another there is the bug this is looking for.
- [ ] Workspace status mix totals **less than or equal to** the sum of the
      per-person columns — a task shared by two people is counted once here and
      twice there, on purpose.
- [ ] Overdue / pending counts open a popover listing the real tasks, each
      linking to its own board (backlog tasks included).
- [ ] "Logged this week" matches Workload for the same person (both from
      `time_entries`, never `tasks.logged_hours`).
- [ ] Mine view: "Available hours" is present and is `capacity − logged`, not
      spare capacity.
- [ ] 375px: KPI tiles stay two-up, the breakdown table scrolls inside its own
      container, and the page does not scroll sideways.
- [ ] Empty roster → "No team members yet" rather than an empty chart.

Automated: `npx playwright test e2e/dashboard-views.spec.ts` (10 across the
three viewports, including the cross-page consistency assertion).

## 🔄 Realtime — the timeline vs. every other page

Needs **two browsers** (or two profiles) signed in as different members. All of
these must happen **with no reload** — a refresh proves nothing.

- [ ] B on `/gantt`. A creates a task in a sprint → the bar appears for B.
- [ ] A **renames** that task → B's bar relabels. (UPDATE delivery; this was the
      one that had never worked.)
- [ ] A **reschedules the sprint** (start/end) → B's chart moves.
- [ ] A deletes the task → B's row disappears.
- [ ] B on `/workload` (Team tab). A changes B's weekly capacity in Settings →
      B's `of Nh` and utilisation move. (`0037` scheduling channel.)
- [ ] B on `/calendar`. An admin **approves** a pending time-off request → the
      dashed amber outline becomes a solid tinted day for B.
- [ ] A **deactivates** a member → they leave B's Workload team list.
- [ ] Notification bell and both activity feeds still stream (regression: the
      three channels were restructured together).
- [ ] **Leave a tab open for over an hour**, then have someone else edit a task.
      It must still arrive — this checks the socket's token refresh survived,
      i.e. that nothing pinned a manual token.

> ⚠️ **A dead channel looks completely healthy.** It reports `SUBSCRIBED`, the
> socket's token reads `authenticated`, Broadcast works and the replication
> slots stay caught up — the handlers just never fire. So the only way to QA
> realtime is to *watch a second browser move*; never infer it from logs, from
> the Supabase dashboard, or from the absence of errors.

> ⚠️ **Don't test by writing within a second of page load.** `postgres_changes`
> has no backfill and the channel joins a few hundred ms after first paint, so a
> write that fast is racing the subscription, not testing it. (`e2e/helpers.ts`
> → `settleRealtime()` exists for exactly this.)

Automated: `npx playwright test e2e/realtime-timeline.spec.ts` (7 across the
three viewports).

## 🔴 Must-test — could block real flows (RLS / server guards, `0027`)

- [ ] Create a task, post a comment, add a reaction — all succeed.
- [ ] Assign a task → dev **accepts** → **pass** it to another dev.
- [ ] Edit your own profile (name/avatar) saves.
- [ ] A non-admin **cannot** self-change role / page access / activation state.
- [ ] Deactivate a member, then delete them (delete only works once deactivated).
- [ ] Cannot deactivate or delete the **last active admin**.
- [ ] Invite someone → they accept and set a password; re-send a stuck invite; **Forgot password**.

## 🟠 Estimator → project → schedule

- [ ] **Guided:** new estimate → Shopify → questionnaire does NOT re-ask platform / e-commerce / hosting → **Generate line items** → Timeline shows.
- [ ] **Catalog:** browse catalog dialog → add items → tentative Timeline appears → Review exports PDF + Excel.
- [ ] **Preview step:** "Start project" shows **Review schedule** first — sprints, each task's assignee and dates, an amber warning for unassigned work. **Nothing is created yet** (cancel → confirm the project doesn't exist).
- [ ] **Back** returns to the options step; changing strategy and re-previewing shows a *different* plan.
- [ ] **Confirm & create** saves **exactly** what the preview showed — spot-check 2 assignees + sprint dates against the preview.
- [ ] **Sync schedule** (existing project) shows the same preview, listing what's missing **and** what changed; "already up to date" short-circuits with a toast and no dialog.
- [ ] **Start project → Manual:** creates project + phase sprints + tasks, **unassigned**.
- [ ] **Start project → Best-fit:** each dev/QA task gets an assignee; go-live/hosting work lands on the InMotion-skilled dev; QA lands on a QA-skilled dev.
- [ ] **Start project → Fastest:** work spreads across *more* devs than Best-fit; finish date is the same or earlier.
- [ ] Nobody is assigned a task whose skill they lack (spot-check 3 tasks against Team → skills).
- [ ] Design/discovery tasks are **unassigned but still dated** (expected — no dev has design skills).
- [ ] Tasks appear **immediately** after conversion — no refresh needed (this was the "empty project" bug).
- [ ] Project page shows the **Timeline** section (project-scoped Gantt); editing a sprint's dates moves its bar.
- [ ] Assignments arrive as **pending** → the dev sees accept/reject/pass.

### Two-way sync: estimate ↔ project

> The pair is keyed on `tasks.source_line_item_id`. Use an estimate that has
> already been started as a project, and a task that came **from** it (not one
> you typed yourself).

- [ ] **Rename a line item** in the estimator → project → **Sync schedule**: the preview's *Existing tasks* block shows `old title → new title`. Confirm → the task is **renamed**, and there is **no duplicate** (this was the bug — title matching added a second task).
- [ ] **Change a line item's hours** (or its tier) → Sync schedule: the preview shows `12h → 18h`; confirm → the task's Estimated hours match.
- [ ] **Delete a line item** → Sync schedule: the preview lists it in **red** as "no longer in the estimate"; confirm → the task is gone.
- [ ] A task you created **by hand** on that project is **never** listed for update or removal, however the estimate changes.
- [ ] **Log time against a seeded task, then delete its line item** → Sync schedule: the task is listed in **amber** as "kept — N h already logged", NOT in red, and after confirming **the task still exists** with its time entry intact.
- [ ] **Rollback:** sign in as a Viewer (or otherwise make the task write fail) and rename a seeded task → the task snaps back AND the estimate's line item still reads the old title. Neither side may keep a change the other rolled back.
- [ ] **The other direction:** rename a seeded task on the project board → a toast says the estimate was updated → open the estimator: the line item carries the new title.
- [ ] Change that task's **estimated hours** to 30 → the line item's hours read 30, and its **base hours** have been divided by the tier multiplier (Advanced 30h → base 20). Re-running **Sync schedule** then says "already up to date" — it must not bounce back and forth.
- [ ] With **Requirements unclear** ticked on the quote, the same round trip still lands on 30h (every line is priced as Advanced).
- [ ] **Delete a seeded task** → its line item disappears from the estimate and the total drops.
- [ ] After any of the above on a quote with a **linked Zoho deal**, the Setup panel's **CRM amount** badge turns amber with the old figure, and **Send to Zoho** previews `$old → $new`.
- [ ] **Timeline tab** on an estimate that has a project shows the **live project Gantt** (with a link to the project page), not the tentative estimate timeline — move a sprint's dates and the estimator reflects it.
- [ ] On a quote with a **PO**: move a sprint so the project range no longer matches the PO's, and the **PO badge** gains "· dates changed"; its tooltip names the new range and says PBS must be corrected by hand.
- [ ] The same edit raises a **warning toast** naming the PO, the billed range and the new one. Change **two more** sprint dates without leaving the page — the toast must NOT repeat for the same resulting range. Renaming a sprint, or flipping its status, raises nothing.
- [ ] Move the sprint back so the range matches the PO again → no toast, and the badge's "· dates changed" clears.
- [ ] A **Member** editing a seeded task changes the task only — RLS hides `proposals` from them, so nothing is written to the quote (and nothing errors).

## 🔌 Zoho CRM

### Connection

- [ ] `/api/zoho/status` (as admin) → `configured: true, connected: true`.
- [ ] **Test** button → toasts "Strategic Connection".
- [ ] **Tomorrow**, hit Test again → still works (proves the ~1h access-token refresh — the most common silent OAuth failure).
- [ ] Signed in as a **member**, open `/api/zoho/accounts?q=openarc` → **403** (CRM data is admin/manager only).
- [ ] **Disconnect → Connect** round-trip still works after the Phase-3 scope widen.

### Client lookup — Accounts → Contacts

Available in **two** places — test both: the **New estimate** dialog's Client field, and the
**editor → Setup tab**'s Client field.

> ⚠️ **These are live CRM values — they drift.** Re-verified 2026-08-17; counts/names below changed
> from the previous run (e.g. `myrtle` 19→20, OpenArc gained a third contact, its deal was renamed
> and moved to Closed Won). Treat *shape* as the pass criterion, not exact counts — a differing
> number is likely real CRM activity, not a bug.

- [ ] **New estimate → Find in Zoho** → pick a company → name fills in and a "**Linked to Zoho**" line appears under the field.
- [ ] Typing over a picked client **clears** the "Linked to Zoho" line (a hand-typed name must never keep a stale CRM link).
- [ ] `openarc` → **OpenArc LLC**; click it → **3 contacts: Mark Williams (Lead Client partner), Mike Carpenter (General Manager, Consulting Services), Joel Reed (CEO)**.
- [ ] `myrtle` → **~20 companies** (first: Myrtle Beach Pelicans).
- [ ] **Person-name fallback:** `kresimir` or `glorioso` → no company matches by name, so it returns **FinOps Partners** badged **"via Kresimir (Kreso) Marusic" / "via Russell Glorioso"**.
- [ ] **Prior deals:** `openarc` → OpenArc LLC shows a "**1 prior deal — Classic Calling Campaign (Closed Won)**" line; companies with none show **no** deal line at all (not "0 deals").
- [ ] Search feels responsive (~1.4s — company search + one batched deal lookup, which must stay **one call** regardless of result count).
- [ ] Back arrow returns to the company list; **"Use the company only"** works (no contact chosen).
- [ ] Picking a contact fills the Client field + toast naming the contact.
- [ ] **Reload the page — the client must still be there.** (Persisting `proposals.zoho` needs `quoteUpdatePayload()` *and* `updateProposal`'s `Pick<>` to whitelist the column; a miss fails silently.)
- [ ] Dialog does not change height between empty / loading / results / no-match.

### Deal → Estimate import ("Import from Zoho")

- [ ] **Proposal Requested** shows **2** deals: *Web Build* (Trade International 2020, LLC) and *John Doe Accounting*.
- [ ] Other stage chips (live counts as of 2026-08-17 — expect drift): Discovery **25+**, Negotiation **15** (incl. *Website Edits FlagrantFoul23*), Verbal Yes **9** (incl. *Soleil Tans*).
- [ ] Free-text search finds a deal by name/company.
- [ ] Pick one → new quote opens pre-filled (title + client) with an **"Imported from Zoho CRM"** panel showing deal, stage, contact, rep, target close.
- [ ] **View in Zoho** opens the right CRM record — *this URL is constructed by us, not returned by Zoho, so it's the piece most worth confirming.*
- [ ] Deals with `Amount: 0` show **no** figure (correct — most real deals have 0, and we now know `Amount` is a Zoho formula field, not a plain one — see the tech-debt note at the bottom).

### Push to Zoho (Phase 3 — writes to the production CRM)

> ⚠️ **This is the only feature that modifies your real CRM.** Test it against the dedicated test
> deal (`3805132000161523001`, "TEST — DO NOT TOUCH"), not a live client deal.

- [ ] The **Push to Zoho** button only appears on quotes **linked to a Zoho deal** — either imported, or linked afterwards via "Link a Zoho deal". Setting only the *client* is NOT enough.
- [ ] Click it → toast confirms; in Zoho the deal's stage is now **"Proposal Sent"** and the proposal **PDF is attached**.
- [ ] ⭐ **Idempotency:** the button now reads **"Pushed to Zoho"** and is **disabled**. Reload — still disabled. *(Zoho does NOT dedupe attachments, so a second push would create a duplicate file.)*
- [ ] Hovering the disabled button shows when it was pushed.
- [ ] A quote with **no** CRM link shows no button at all.
- [ ] As a **member**, `POST /api/zoho/deals/<id>/push` → **403**.
- [ ] Confirm in Zoho that **Amount and Quote_number are unchanged** — by design, we never write them (formula / autonumber fields).

### Link a hand-made quote to a deal

- [ ] Create a quote **manually** (New estimate, not imported) → Setup tab shows "**Not linked to a Zoho deal**" with a **Link a Zoho deal** button, and the header has **no** Push button.
- [ ] Click it → the deal picker opens → choose the **TEST** deal → panel becomes "**Linked to Zoho CRM**" and **Push to Zoho** appears in the header.
- [ ] If the Client field was already filled, linking must **not** overwrite it; if it was empty, it fills from the deal.
- [ ] **Reload** → the link persists.

### Closing the loop — "Mark complete in Zoho"

- [ ] The button is **hidden** on a project whose status isn't `completed`.
- [ ] Set the project to **completed** → the button appears (CRM-linked projects only).
- [ ] Click it → the deal moves to **"Project Completed"** in Zoho, and **no new attachment** is added.
- [ ] ⭐ **Per-stage guard:** this must work *even though* the quote was already pushed as "Proposal Sent" — the two stages are tracked separately. Then the button reads "Zoho notified" and disables.
- [ ] The quote editor's own "Push to Zoho" button is **unaffected** by the completion push (still shows its own state).

## 🔒 Audit fixes (2026-10-09)

Run `node scripts/security-probe.mjs` first — every line must read PASS (P1b and P18–P21 are new).

- [ ] **Estimate links survive edits.** Create a PO (or link a deal) on an estimate in one tab, edit a line item in a second tab that loaded it earlier → reload: the PO number / deal is still there.
- [ ] **Start project once.** Approve an estimate, open Start project in two tabs, confirm in both → the second refuses ("This estimate already has a project"); only one project exists.
- [ ] **No double buffer.** Estimate with a 20% buffer → Start project → the project page shows **0%** buffer and its "with buffer" forecast equals its planned finish; the sprint dates still match the estimate's Gantt.
- [ ] **Seeded hours = line hours.** Tick "Requirements not pinned down" → Start project → each task's estimate equals its line's quoted hours (Advanced), not the raw base hours.
- [ ] **Regenerate asks first.** On a guided estimate with line items, press Generate line items → a "Replace all line items?" dialog; Cancel leaves the lines untouched. With a linked project it also warns about the project's tasks.
- [ ] **Due dates are the day you picked.** Create a task due on the 15th → the card, list, table and drawer all say the 15th (check in a UTC+ timezone and a UTC− one).
- [ ] **Sign out clears the screen.** Sign out → the login page loads fresh; Back does not show the previous person's dashboard.
- [ ] **Delete project tells the truth.** Delete a project with logged time → the dialog lists sprint/task counts and the hours that will be erased in red, and names the linked estimate and PO.
- [ ] **Logging time.** Log 1h on a task → the task total and "Logged this wk" both move by 1h; with the network blocked for `time_entries`, the toast says "Couldn't log time" and the total does not move.
- [ ] **Confirm link redirect.** `/auth/confirm?…&next=//evil.example` → after Continue you land on `/dashboard`, not the other site.
- [ ] **Deactivation is immediate.** Deactivate a member who is signed in elsewhere → their next write (e.g. moving a card) fails at once.

## 🗓️ Company holidays (0049)

- [ ] **Settings → Workspace → Holidays** lists the 11 federal holidays with their next date. Admin: Day off / Working toggles. Manager: read-only with "Only admins can change holidays." Member/viewer: no Workspace tab.
- [ ] Mark **Columbus Day** as Working → the Calendar no longer marks it; Workload for that week shows full capacity (no "− 1 holiday"); a new estimate's timeline no longer skips it.
- [ ] Set it back to Day off → all three return.
- [ ] `node scripts/security-probe.mjs` → P27 PASS.

## 📈 Sprint velocity & burndown

- [ ] **Project page → Velocity card** (below the timeline): Velocity, Work left and Forecast tiles; with no ended sprint, Velocity and Forecast show "—", not 0.
- [ ] Finish a task inside a sprint before its end date → after that sprint ends, its "Finished in the sprint" bar includes the task's estimate. A task finished after the end date does not count for that sprint.
- [ ] **Burndown** defaults to the sprint running today; the line stops at today; the picker switches sprints.
- [ ] A done task with no estimate → the card says it counts as 0 h.
- [ ] **Reports → Projects** table has a Velocity column matching the project page.
- [ ] At 375px the bar chart's sprint names don't overlap (some are skipped; hovering a bar names it).

## 🔒 Hours & feed integrity (0048)

Run `node scripts/security-probe.mjs` — P22–P26 must PASS.

- [ ] **Logged total is read-only.** In a task's drawer the logged total can't be edited by anyone (admin included). An accepted assignee sees **Add time**; adding 1.5 moves the total and "Logged this wk" by 1.5. A manager not on the task sees no Add time.
- [ ] **Timer still logs.** Start → Stop the session timer as an accepted assignee → the total grows by the session.
- [ ] **Deleting keeps hours.** Log time on a task, delete the task → the person's "Logged this wk" (Workload) and Reports' per-person hours are unchanged. The delete dialog says the hours stay.
- [ ] **Bell times are real.** New notifications and activity show "just now", never a past date.

## 🧭 Product decisions (2026-10-12)

Apply `0047` first (`npm run db:push`).

- [ ] **No blank projects.** /projects shows **New project** disabled; hovering it explains why. No "New project" in the header, no *Create project* in the + menu, no *Create project* quick action on the dashboard. With no projects, the empty state offers **Open the Estimator**.
- [ ] **No project picker.** New estimate has no "Internal project" field; the editor's Setup shows the linked project as a link, or "None yet — Start project creates it".
- [ ] **Approved estimates are frozen.** On a project made by Start project, change a seeded task's hours → the estimate's line item and price do NOT change; one toast says the estimate keeps the agreed price.
- [ ] **No deal, no PO — and no project.** An estimate approved by hand with no Zoho deal shows "Start project needs a won Zoho deal" instead of **Start project**; a direct `POST /api/pbs/pos` for it returns 409.
- [ ] **Every project gets a PO (one button).** A won estimate shows **Start project** only (no separate Create PO). Start project → Review schedule → **Next: billing** → the PO dates come from that schedule; **Back** returns to the schedule; the final button reads **Create PO & start project**. Afterwards the project exists AND the estimate shows its PO.
- [ ] **Already billed skips billing.** An estimate with a PO but no project: Start project → Review schedule shows "Billed as PO … already" and **Confirm & create**, no billing step.
- [ ] **From the list.** A won estimate's card shows **Start project**; it opens the estimate with the Start project dialog already open.
- [ ] **Legacy only.** A project started before this change with no PO still shows **Create PO** on its estimate (header + card).
- [ ] **Scope demo (demo UI only).** Estimator → dashed "Preview" strip → **Try the demo**: an amber "Demo UI only" banner on every step; **Create & draft lines** shows three progress lines, then 13 drafted lines; unticking one lowers the count and total; **Add … lines (demo)** → line items; **Save to task library** says nothing was saved. No real estimate appears in the list afterwards.
- [ ] **Switch a questionnaire section off.** Scope & risk → Questionnaire → **SEO & Digital Marketing** → untick **Include this section in the estimate** → the section shows "Left out" (struck through) in the list, its questions disappear, Hours has no SEO phase, the Timeline has no SEO bar, and the total drops. Tick it again → everything returns with the old answers. Sections 1 and 2 have no checkbox.
- [ ] **Skipped required questions don't count.** Clear the Project Start Date (section 7) → "1 required left"; switch section 7 off → the count and the risk score's unanswered figure drop.
- [ ] **Who does the work (Adjust tab).** A new estimate's card shows **Best-fit** selected and "Launches <date>". Pick **Fastest** → the launch date updates and the Timeline (Scope & risk) shows "Planned with Fastest (set on the Adjust tab)". The price on the Totals card does NOT change.
- [ ] **Frozen on approval.** Approve the estimate (or win its deal) → the picker is disabled and the card says "Quoted launch: <date>". Set it back to Draft → the picker works again.
- [ ] **Start project uses it.** Start project shows "Plan: Fastest, as quoted" (no picker). If the team got busier since approval, Review schedule shows an amber "Quoted launch X → now Y".
- [ ] **Closed projects leave workload.** Mark a project Completed → its open tasks disappear from Workload (both tabs), both dashboard views, Reports' Overdue, and the next Start project's "already booked" hours.
- [ ] **On-time uses completion date.** Finish a task before its due date, then rename it after the due date → the on-time % on Dashboard and Reports does not drop. Reopen it → `completed_at` clears.
- [ ] **Seeded assignees are notified.** Start project with auto-assignment → each assignee gets ONE bell notification ("assigned you N tasks on …") linking to the project.

## 📱 Top bar + Estimator tabs on a phone (375px and 320px)

- [ ] Top bar shows ☰, the page name, ?, 🔔, + and nothing else; the page name
      is not cut to a couple of letters.
- [ ] + opens the task menu; *Create project* is its last item for admins and
      managers only. On a sprint board / backlog (+ hidden) a folder icon opens
      Projects instead.
- [ ] ☰ → the drawer has a *Light / dark* switch, and its badge says *Live* on
      the live app.
- [ ] No empty strip down the right of page headers, cards or lists next to a
      **?** (project header, Workload → Weekly capacity, Adjust cards). The
      estimate header's status, Export and price sit on the left.
- [ ] Calendar and Workload: the Mine / Team switch, Today and the month
      arrows start at the left edge on a phone (right-aligned from 640px up).
- [ ] Estimator editor: Setup · Scope · Lines · Adjust · Review sit on ONE row
      at 375 and 320; from 640px up they read Scope & risk / Line items.

## 📱 Tablet pass @ 768px + 1024px (iPad portrait / landscape)

- [ ] **768px (iPad portrait):** sidebar is a **narrow icon rail** — no text labels, no group headings, no wordmark; hovering/long-pressing an icon shows its name.
- [ ] Active page is still visibly highlighted on the rail.
- [ ] Bottom tab bar is **gone** at 768px (rail replaces it) and **back** below 768px.
- [ ] User avatar sits at the bottom of the rail and opens Settings; sign-out still reachable.
- [ ] **1024px (landscape):** full sidebar with labels returns — nothing stuck in rail mode.
- [ ] Timeline/Gantt: bars have usable width at 768px (name pane must not dominate).
- [ ] Workload stat cards: 2-up at 768px, 3–4 across only at 1024px+.
- [ ] Calendar month grid readable at 768px **and** 1024px — the day-detail panel must sit *below* the month (not beside it) until ~1280px, or day cells get squeezed to ~58px.
- [ ] No page scrolls sideways at 768px or 1024px.
- [ ] Spot-check the rest at 768px — Dashboard, Projects, Project overview, Board, Team, Settings, Activity, Reports, Estimator list + editor. All audited as safe; these are confirmation only.

## 🟢 Mobile pass @ 375px

- [ ] Estimator: Line items (collapsible), Questionnaire, Catalog dialog, Review (no sideways scroll), Timeline (zoom + clickable bars).
- [ ] **Zoho client-lookup dialog**: ~85% of screen height, no iOS zoom on focus, long emails truncate, full-width Cancel reachable.
- [ ] **Workload**: team rows are stacked cards, no horizontal scroll.
- [ ] **Kanban**: columns snap one at a time; each card shows grip + ⋯ menu **without hovering**; drag by the grip works by touch.
- [ ] Team, Settings tabs, Activity filters, Calendar, bottom-nav **More** drawer.

## ♿ Accessibility

- [ ] **Skip to content:** press <kbd>Tab</kbd> on a dashboard page → link appears → jumps past the nav.
- [ ] **Reduce motion:** enable the OS setting → dialogs/toasts/task-pulse stop animating.
- [ ] Run **Lighthouse / axe DevTools** on Dashboard, a sprint board, and the Estimator.
- [ ] **Colour contrast (WCAG AA 1.4.3)** — `muted-foreground` text + badges in **both** themes. *The one AA item impossible to verify from code.*
- [ ] Keyboard-only pass over the Kanban board and one dialog (open, operate, `Esc`, focus returns).

> CLAUDE.md still lists Phase 4 (Performance + WCAG) as pending overall — the two items above are
> partial coverage (skip-link, reduced-motion), not a full pass.

---

## Known pre-existing tech debt (found by an earlier QA pass, NOT introduced by recent work)

`npm run lint` → **18 errors / 22 warnings** (was 19; `notifications-store.ts` `prefer-const` fixed).
`next build` passes regardless, so none are release-blocking:

| Where | Count | Issue |
|---|---|---|
| `components/features/tasks/TaskCommentSection.tsx` | ~15 | React Compiler: *"Cannot access refs during render"* (the @mention autocomplete reads refs while rendering) |
| `app/(dashboard)/dashboard/page.tsx:173` | 1 | *"Cannot call impure function during render"* |
| `components/features/proposals/ProposalEditorClient.tsx` | 1 | React Compiler can't preserve the `analyzeDiscovery` memo — deps are `[quote?.discovery]` but it infers `quote` |
| misc | warnings | unused vars, one `<img>` (use `next/image`), one `useEffect` missing dep |

**Recommendation:** worth a dedicated cleanup pass — especially the ref-during-render ones, which
React Compiler flags because they *can* misbehave. Not urgent; just don't let the count grow.

## Notes / issues found while running this checklist

- …
