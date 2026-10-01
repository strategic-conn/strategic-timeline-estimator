# Onboarding tours — plan

> Status: **BUILT 2026-10-01** — Phases 0-5 in one pass (engine, ? menu, welcome,
> every page/tab tour, checklist, nudges, existing-user rule, versioning, a11y
> basics). All §2 decisions as confirmed. Where the build differs from this
> plan, see §10. Verified by `e2e/tours.spec.ts` (1280/768/375) and probe P17.
> The rules that matter for future edits are in CLAUDE.md → "Onboarding tours".

## 1. Goal

A new user (invited member, new manager, new admin) can learn each page **in the
page itself**: a short guided tour that highlights one section at a time with a
tip, started from a **Help / Tour button** that is always in the header, plus a
one-time welcome on first sign-in.

What "done" means for a newbie:

- They are *offered* a tour the first time they land somewhere, never forced into one.
- They can replay any page's tour at any time from the header.
- The tour only ever shows them what **their role and page access** can actually use.
- Nothing the tour does changes data — ever.

### What good apps do (and what we copy)

| Practice | Why | How we apply it |
| --- | --- | --- |
| **Short tours, 3–7 steps** | completion drops sharply after ~5 steps | one tour per page (or per tab), not one giant app tour |
| **User-initiated beats forced** | auto-launched overlays get dismissed unread | first visit shows a *nudge* (pulsing dot on Help + "New here? 1-min tour"), not an auto-start — except the one welcome tour |
| **Always skippable, always resumable** | people get interrupted | Skip on every step, Esc closes, "Resume" in the Help menu |
| **Progress indicator** | "how long is this?" is the first question | "Step 2 of 5" on every popover |
| **Contextual, not a manual** | tips are remembered when seen next to the control | each step anchors to the real control |
| **Teach by empty state too** | a new user's pages are empty | empty states already have CTAs; the tour points at them instead of at a board that isn't there |
| **"What's new" re-use** | same engine announces changes | tours are versioned; bumping one re-offers it (Phase 4) |

## 2. Decisions (confirmed 2026-10-01 — the Recommendation column is what we build)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| D1 | Tour engine | **driver.js** (MIT, ~5 kB, no deps, framework-agnostic, handles scroll-into-view / resize / overlay cut-out) themed with our Tailwind tokens | Build on Radix `Popover` + a spotlight div (zero deps, but we'd re-implement positioning, scroll, resize, keyboard). **Avoid** Shepherd.js and Intro.js — both need a paid licence for commercial use. react-joyride: check React 19 support before considering |
| D2 | Where "tour seen" is stored | **New table `tour_progress`** (`profile_id`, `tour_id`, `version`, `status` completed/dismissed, `updated_at`), RLS self-only | `profiles` column — **no**: `profiles` is on the `workspace:scheduling` realtime channel, so every "I finished a tour" would broadcast to every open client and hit `team-store`'s echo handling. `localStorage` only — acceptable for demo mode, but a new laptop re-nags the user |
| D3 | First sign-in | Welcome **dialog** (Start tour / Later / Don't show again) → short app tour of the nav + header | Auto-start the tour with no dialog |
| D4 | First visit to other pages | **Nudge only** (dot on Help button + one dismissible line), never auto-start | Auto-start each page's tour once |
| D5 | Estimator editor (5 tabs) | **One short tour per tab**, started from that tab; the Setup tour ends with "each tab has its own tour" | One long tour that switches tabs itself (tab is `useState` in `ProposalEditorClient`, so this needs the tour to drive component state — more coupling) |
| D6 | Getting-started checklist on the Dashboard | **Included** — see §5a. Items tick themselves from real data | Skip |
| D7 | Tours in demo mode | Yes, same tours, progress in `localStorage` | — |

## 3. Hard rules (the things we must not get wrong)

1. **Read-only.** A tour highlights; it never clicks, submits, drags or opens a
   write dialog. This app writes to **live Zoho** (no DELETE scope) and **live
   PBS** (no delete endpoint). "Send to Zoho", "Create PO", "Start project",
   "Mark complete in Zoho", "Approve", "Apply buffer", "Update to current rates"
   are *explained* by the tour, never *pressed* by it. Enforced by an e2e check
   (§8).
2. **Role- and access-aware.** Every step declares who may see it
   (`canExportProposals`, `canEditHourlyRates`, `canCreateProject`, admin-only,
   …) using the **same `usePermissions()` flags** the UI uses. A Viewer's
   buttons are hidden, not disabled — so a step about "Add task" must not exist
   for a Viewer rather than point at nothing. Pages outside the user's
   `page_access` (`resolveAccessibleHrefs`) get no tour and no nudge, and the
   welcome tour's nav step lists only reachable pages.
3. **Wait for data.** Stores hydrate async and show skeletons / `—` first
   (rule 2). A tour starts only after the page's `loaded` flag, and a step
   whose target isn't in the DOM is **skipped**, not shown floating mid-screen.
4. **Empty-state aware.** A brand-new member has no projects, sprints or
   tasks. Steps have an optional `emptyTarget`: "no projects yet → here's where
   you'll create one" (or, for a member who can't create, "a manager will add
   you to a project").
5. **Three layout tiers.** Nav lives in three places: bottom tab bar + drawer
   (`< md`), icon rail (`md–lg`, labels hidden), full sidebar (`lg+`). Nav
   steps target a per-tier element, and at `< md` the popover renders as a
   bottom sheet so it never covers the element it describes. Every tour is
   checked at 375 / 768 / 1280 like `page-header-fit.spec.ts`.
6. **Stable targets.** Steps anchor on `data-tour="dashboard.kpis"`
   attributes, never on classes or text. The ids live in one constant file so a
   rename is a type error, and the e2e suite can assert every id exists.
7. **Accessible** (Phase 4 WCAG pass is still pending — this must not add
   debt): focus moves into the popover, Tab stays inside it, Esc closes, ←/→
   step, focus returns to the Help button on close, `aria-live` announces the
   step, `prefers-reduced-motion` removes the animation, overlay and popover
   pass contrast in light **and** dark.
8. **Doesn't fight other layers.** Dialogs, drawers (Task drawer), popovers
   and sonner toasts have their own z-index / focus traps. A tour never runs on
   top of an open dialog; opening one ends the tour step cleanly.
9. **Copy is plain strings in one place** (no HTML from data), so DOMPurify
   isn't needed and copy edits don't touch components.

## 4. Architecture (small on purpose)

```
lib/tours/
  ids.ts            // TOUR_TARGETS — every data-tour id, as const
  tours.ts          // TourDef[]: { id, version, route matcher, steps[] }
                    // step: { target, title, body, visibleIf?(perms), emptyTarget?, placement? }
store/tour-store.ts // progress (hydrate from tour_progress / localStorage), active tour, resume point
components/features/tour/
  TourRunner.tsx    // wraps the engine: filters steps by perms + DOM presence, themes it
  HelpMenu.tsx      // the header button (below)
  WelcomeDialog.tsx
supabase/migrations/00xx_tour_progress.sql   // table + self-only RLS (if D2 = table)
```

- One `TourDef` per page/tab; a route matcher picks the tour for the current page.
- Progress follows the synced-store bridge (hydrate + optimistic upsert), like
  every other store — no TanStack.
- No realtime channel for `tour_progress` (nobody else cares).
- `version` per tour: completed-at-v1 + tour now v2 → nudge again (Phase 4).

### The Help / Tour button

In `dashboard-header.tsx`, beside `NotificationBell` (a `CircleHelp` icon,
reusing the icon `HelpTip` already uses so the "?" means one thing). Menu:

- **Tour this page** (disabled with a reason if the page has no tour)
- **Resume tour** (only when one was left mid-way)
- **Welcome tour**
- **Getting started** (reopens the checklist after it was dismissed)
- **Reset all tours** (in Settings → Profile as well)

A small dot on the button = this page has an unseen tour. At 375px the header
is already tight (bell, theme, New, Add) — the button must fit; check with
`page-header-fit.spec.ts`.

Existing `HelpTip` (`components/common/help-tip.tsx`, used in the Task drawer
and time tracker) stays as the **inline** help layer; tours are the guided
layer. Pages with dense concepts get more `HelpTip`s rather than longer tours.

## 5. Tour content outline (per page)

Roles: **A** admin · **M** manager · **Mb** member · **V** viewer. Each bullet ≈ one step.

### Welcome tour (first sign-in, all roles)
- Navigation: groups Workspace / Plan & people / Commercial / System (only reachable pages)
- Header: notifications bell, Add task (not V), New project (A/M), theme
- Your profile card (bottom of sidebar) → Settings
- The Help button: "every page has its own tour — find it here"

### Dashboard
- Mine / Team toggle (A/M only — hidden for Mb/V)
- KPI cards; "—" means still loading, not zero
- My open work: donut + utilisation bar — same numbers as Workload
- Due soon (includes overdue); overdue badges open the task list
- Quick actions · Activity
- Team view (A/M): over-capacity banner, busiest-first breakdown

### Projects → Project overview → Sprint board → Backlog
- Project list + New project (A/M) — empty state if none
- Overview: sprints are the project's timeline; embedded Gantt; backlog = tasks with no sprint
- Risk buffer: *forecast first*, applying moves sprint dates after a preview (A/M)
- "Sync schedule from estimate" (A/M, estimate-linked projects): preview → confirm
- Sprint board: Kanban / List / Table switch; drag a card to change status; **moving to Done is how work is finished**
- Task card → Task drawer: accept / decline an assignment, log time (accepted assignees only), comments + reactions
- "Mark complete in Zoho" (A/M, completed projects) — explained, not pressed

### Calendar
- Mine / Team (A/M)
- Legend: pending leave = dashed amber outline, approved = tinted, holidays marked
- Request time off → it's a request until an admin/manager approves

### Timeline (Gantt)
- Bars = sprints; on mobile swipe sideways (swipe hint)
- Holiday / time-off notes on the chart explain shifted dates

### Workload
- Mine / Team (A/M); bar colour = task status, amber ring = over capacity
- "Allocated" includes pending assignments
- **"Available" is time left this week, not spare capacity** — utilisation answers that
- Count badges open the tasks behind them
- Weekly hours input

### Team
- Member rows, work keys shown ("IT L2")
- Star button → Work keys & skills (A edits, others read)
- Invite / access / deactivate (A only)

### Activity · Reports
- Feed filters; per-project feed
- Reports KPIs; export

### Estimator (A/M only) — list
- List vs **Stages** board (a Zoho-shaped pipeline; "Not in Zoho" column)
- New estimate · Import from Zoho
- Card badges: Zoho stage, PO status; **Create PO appears only once a deal is won**

### Estimator editor — one tour per tab (D5)
- **Setup:** client lookup ("Find in Zoho"), products from Zoho, platform
- **Scope & risk:** "Start guided scoping", Min/Mid/Max, Timeline/Gantt, Generate line items
- **Line items:** catalog browser, tiers (Basic 1× / Advanced 1.5× / Custom 2×), role + rate snapshot per line
- **Adjust:** add-ons; "Requirements not pinned down" = *pricing* vs Risk buffer = *dates only* (the contrast is the lesson); rates card / "Update to current rates"
- **Review:** PDF / Excel; **Send to Zoho** writes to the CRM behind a preview; Start project after approval

### Settings
- Profile (photo, name) · Time off
- Team time-off approvals (A/M): approval dialog shows what the absence costs before you approve
- Workspace (A/M): hourly rates (A edits, M reads), Zoho connection (A)
- Reset tours

> **Content risk:** this copy restates behaviour documented in CLAUDE.md. When a
> feature's behaviour changes, its tour copy is part of the same change (same
> rule as the docs-discipline note), and the tour's `version` is bumped.

## 5a. Getting-started checklist

A card on the Dashboard's **Mine** view: "Getting started · 2 of 5", one row per
item with a **Show me** button. It is how people learn by *doing*, where a tour
only teaches by pointing.

### Rules

1. **An item ticks itself from real data. The user never ticks it.** Each item
   is a pure check over stores we already load ("has `avatar_url`", "has a
   `time_entries` row by me"). Nothing about completion is stored, so the
   checklist can't claim something that didn't happen. Only the checklist's
   *dismissed* state is stored (in `tour_progress`, as `tour_id = "checklist"`).
2. **"Show me" navigates and starts that page's tour at the right step.** The
   tour points at the control and the user does the action, so the read-only
   rule (§3.1) still holds. No item ever creates data on the user's behalf.
3. **Items that can't apply yet are not blocking.** "Respond to your first
   assignment" when nobody has assigned you anything shows *"Nothing assigned
   yet"*, greyed out, and doesn't count against progress. Nobody should be
   stuck at 4 of 5 through no fault of their own.
4. **Items follow role and access** (same flags as §3.2). A Viewer never gets
   "Create a project".
5. **Nothing fake.** No item asks someone to request time off, create a test
   project or send anything to Zoho just to tick a box. Those would put junk
   into live data and live CRM.
6. **Wait for data.** The card shows a skeleton until the stores it reads have
   `loaded`. Otherwise every item reads "not done" first, then flips.
7. **Finishing:** at 100% the card says "You're all set", then hides on the next
   visit. **Dismiss** (×) hides it early. Both can be reopened from the Help menu.
8. **Layout:** it goes at the top of the sidebar column, above My open work.
   The Mine grid uses explicit placement, so the card needs its own column and
   row, or it drops into a gap. Pin that in `dashboard-views.spec.ts`.

### Items per role

| Item | Done when | A | M | Mb | V |
| --- | --- | :-: | :-: | :-: | :-: |
| Take the welcome tour | `tour_progress` welcome = completed | ✓ | ✓ | ✓ | ✓ |
| Add a profile photo | `profiles.avatar_url` set | ✓ | ✓ | ✓ | ✓ |
| Set your weekly hours | own `weekly_capacity` row exists (RLS lets anyone write their own) | ✓ | ✓ | ✓ | — |
| Respond to your first assignment | no `pending` `task_assignees` row of mine left, and I had at least one *(N/A if none ever)* | — | — | ✓ | — |
| Log your first hours | a `time_entries` row by me *(N/A until I have an accepted task)* | — | — | ✓ | — |
| Create your first project | a project I own | ✓ | ✓ | — | — |
| Create your first estimate | a `proposals` row exists *(needs `canExportProposals`)* | ✓ | ✓ | — | — |
| Invite a teammate | a team member other than me | ✓ | — | — | — |
| Connect Zoho CRM | `/api/zoho/status` connected | ✓ | — | — | — |
| Explore the Timeline | `tour_progress` gantt = completed | — | — | — | ✓ |

> "Respond to your first assignment" needs care. `respondToAssignment`
> **deletes** the row on decline, so "responded" can't be read back from the
> data. The check is "had an assignment and none is still pending". If that
> turns out to be flaky, drop to "Open your first task" (a tour step completed).

### Existing users at launch

The people already using the app must not get a welcome dialog and a checklist
on their next sign-in. A `TOURS_LAUNCHED_AT` constant is compared to
`profiles.confirmed_at`:

- **Confirmed after launch** gets the welcome dialog, the checklist and the nudges.
- **Confirmed before launch** gets none of those automatically. They see one
  "New: page tours — find them under ?" hint and the dot on the Help button.
  Everything is still reachable from the Help menu.

No migration or backfill is needed. Demo mode treats everyone as new.

## 6. Phases

| Phase | Scope | Exit check |
| --- | --- | --- |
| **0** | Confirm §2 decisions; spike driver.js theming in light/dark + 375px | screenshot review |
| **1** | Engine (`lib/tours`, `tour-store`, `TourRunner`), `tour_progress` migration + RLS + probe, Help button, Welcome dialog + welcome tour, **Dashboard** tour | e2e: welcome shows once per user, never again after dismiss; replay works |
| **2** | Everyday pages for every role: Projects, Project overview, Sprint board + Task drawer, Backlog, Calendar, Workload, Timeline | e2e target check passes for Mb and V at 3 widths |
| **3** | Manager/admin pages: Estimator list + 5 editor tabs, Team, Settings, Reports, Activity | e2e target check for A and M |
| **4** | Getting-started checklist (§5a) + "Show me" deep-links into tours, first-visit nudges, existing-user rollout rule | e2e per role: each item ticks after the real action, N/A items don't block, existing user sees no welcome/checklist |
| **5** | Versioning ("what's new"), a11y pass (keyboard, screen reader, reduced motion, contrast in both themes) | manual a11y + keyboard-only walkthrough |

## 7. Out of scope (add when asked)

- Analytics on where people abandon a tour — no analytics stack exists; add if we get one.
- Video / GIF tips, a help-centre site, AI "ask how to" (Esther is parked).
- Admin-editable tour copy in the UI.

## 8. Testing

- **`e2e/tours.spec.ts`** — for each role × each width: open each page, run its
  tour, assert every non-skipped step's target is **visible and inside the
  viewport**, and the popover doesn't overflow at 375px. Negative control: a
  deliberately wrong target id must fail the test (the layout-integrity lesson).
- **No writes during a tour:** record network requests while running every tour
  and fail on any non-GET to Supabase / `/api/zoho` / `/api/pbs` other than the
  `tour_progress` upsert.
- **Permissions:** a Viewer's tours contain no step about an action they can't take.
- **Security probe:** add a case — a member cannot read or write another user's `tour_progress`.
- **Demo mode:** tours run with no env vars; progress persists in `localStorage`.
- **Checklist:** every item is checked against a fixture where it is done and one
  where it isn't, so both directions of each check are proven. Any e2e-created
  data is `[E2E]`-prefixed and deleted in teardown, as the suite already requires.

## 10. As built — where it differs from the plan

- **Members get no "Set your weekly hours" item.** RLS lets them write their
  own row, but no screen offers it (the inputs are on Workload's Team view), so
  the item would be a dead end. Admin + manager only.
- **"Create your first estimate" means one YOU created** (`proposals.owner_id`,
  now mapped read-only). Counting any estimate in the workspace ticked it for a
  brand-new admin on day one.
- **The welcome dialog shows on /dashboard only**, where sign-in lands, and
  nudges skip the dashboard (the dialog already covered it).
- **No separate Task drawer tour.** The drawer is a Radix modal, which makes
  everything outside it inert, so a popover on top of it can't be clicked. The
  board tour's "A task" step explains what the drawer holds instead.
- **Versioning is the dot.** A tour seen at an older `version` shows the dot
  and "New" again; there is no separate "what's new" message.
- **Also in the Settings → Profile tab:** a small "Tours & tips" card (reset +
  reopen the checklist), as §4 said.

## 9. Docs to update when it ships

CLAUDE.md (new section + structure tree + State Management Map + Data Access Map
row for `tour_progress`), `architecture/app-architecture.json` + `.html`,
`architecture/QA-checklist.md` (walk each tour and the checklist per role, and check an existing user sees no welcome).
