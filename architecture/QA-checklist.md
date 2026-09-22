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
- [ ] **Create PO** on that estimate → the pre-filled end date matches the Gantt's launch date, not a plain business-day count.
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

## 🔐 Security probe (automated, live)

`node scripts/security-probe.mjs` — creates a throwaway `[E2E]` member, attacks
PostgREST with that member's real JWT, reads every result back with the service
key, and cleans up. **Every line must read PASS**, and the last line must say
`cleanup: clean`.

- [ ] Run it after ANY change to an RLS policy, trigger or constraint.
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
