# CLAUDE.md — Timeline Estimator & Project Management Tool

> This file gives Claude full context about this project.
> Place it at the project root. Claude reads it automatically when you open this project.
> Keep it updated as the project evolves — treat it like a living onboarding doc.

---

## What This Project Is

A full-scale **Project Management & Timeline Estimator** SaaS application. It allows project
managers, team leads, and developers to create projects, manage tasks on Kanban boards,
visualize schedules on Gantt charts, track team availability and PTO, generate client
proposals, and export reports to PDF and Excel.

**My role:** Frontend (Next.js) **and** the Supabase backend (Postgres schema + RLS live in
this repo under `supabase/`). No separate backend developer — the frontend talks to Supabase directly.

**Development approach:** AI-assisted with Cursor. Aim for clean, production-grade code —
not just fast code.

---

## Current Status

> **Wired to Supabase, with a demo fallback.** When `NEXT_PUBLIC_SUPABASE_*` env vars are set,
> every feature reads/writes live Supabase (Auth, Postgres, RLS, Realtime, Storage). With **no**
> env vars the app falls back to the original demo (Zustand + `localStorage` + `DUMMY_*` seeds) so
> it still runs with no backend. The switch is the `isSupabaseConfigured` flag
> (`lib/supabase/config.ts`), checked in every store/hook. Integration used a **synced-store
> bridge** — each store hydrates from Supabase and does optimistic write-through + rollback —
> **not** TanStack Query. See "Backend Relationship" below and `docs/supabase-integration-plan.md`.

| Phase | Description                      | Status                                  |
| ----- | -------------------------------- | --------------------------------------- |
| 1     | Auth, Projects/Workspaces, Tasks | **Wired** (live Supabase; demo fallback) — real Auth, projects, sprints, tasks/assignees, Kanban/list/table, backlog |
| 2     | Collaboration, Scheduling, PTO   | **Wired** — comments/reactions, notifications + activity feed (Realtime), calendar, workload, PTO/availability, weekly capacity |
| 3     | Estimator, Gantt Charts, Pricing | **Wired** — **Estimator** (Discovery + Proposals merged: guided questionnaire *or* catalog → one quote), approval → Start project; Gantt/Timeline + PDF/Excel export (client-side) |
| 4     | Integrations, Performance, WCAG  | Realtime (board + scheduling, via `liveChannels`) + Storage (avatars) done; RLS/security audit done. **Perf + WCAG passes still pending** |
| —     | Onboarding                       | **Done** — per-page guided tours (driver.js) from the header's ? button, welcome dialog for newcomers, Getting started checklist. See "Onboarding tours" below |

> Update this table when a phase starts or completes. "Wired" means the store hydrates from and
> writes to Supabase behind the `isSupabaseConfigured` flag, with the demo path kept as a fallback.

**Total estimated FE hours (AI-assisted): ~232 hours**

---

## Tech Stack (Frontend)

This repo’s `AGENTS.md` notes that **Next.js behavior/conventions may differ** from typical docs.
When unsure, check `node_modules/next/dist/docs/` in this project before implementing.

### Installed (current)

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Framework    | Next.js 16.2.1 (App Router)                             |
| UI           | React 19.2.4                                            |
| Language     | TypeScript                                              |
| Styling      | Tailwind CSS 4 (+ `tw-animate-css`)                     |
| UI kit       | shadcn/ui (generated) on `radix-ui`                     |
| Charts       | recharts 3 via shadcn `components/ui/chart.tsx`          |
| Icons        | lucide-react                                            |
| UI State     | Zustand 5 (+ `persist` to localStorage — demo backend)  |
| Forms        | React Hook Form 7 + Zod 4 (`@hookform/resolvers`)       |
| Drag & drop  | @dnd-kit (core / sortable / utilities) — Kanban board   |
| Toasts       | sonner                                                  |
| Theming      | next-themes (light/dark)                                |
| Command menu | cmdk                                                    |
| Dates        | date-fns, react-day-picker                              |
| Sanitization | DOMPurify (user-generated content)                      |
| PDF export   | jsPDF + jspdf-autotable                                 |
| Excel export | xlsx (SheetJS)                                          |
| Patching     | patch-package (`postinstall`)                           |
| Tours        | driver.js 1.x (MIT) — onboarding tours, wrapped by `lib/tours/run.ts` only |
| Backend SDK  | `@supabase/supabase-js` + `@supabase/ssr` (wired — Auth, data, Realtime, Storage) |

### Planned / not yet added

| Layer        | Technology                   | Notes                                            |
| ------------ | ---------------------------- | ------------------------------------------------ |
| Server State | TanStack Query (React Query) | **Installed but not wired** (no `QueryClientProvider`) — the synced-store bridge covers caching; revisit if a feature needs true server-state caching |

> **Reality check:** the backend is **Supabase** (see [docs/backend-supabase.md](docs/backend-supabase.md)),
> and it is **wired**. When env vars are set, `lib/supabase/` + `supabase/migrations/` back every
> feature via the synced-store bridge (Auth, data, Realtime, Storage). `proxy.ts` (Next 16's
> renamed root middleware) refreshes the session and no-ops without env vars, so the **demo
> fallback runs unchanged**. There is **no `lib/api/` folder and no axios** — Supabase replaces that layer.

---

## Project Structure

```
app/
├── (auth)/                                    # login, register (own layout)
├── (dashboard)/                               # all protected pages
│   ├── dashboard/page.tsx                     # KPI cards, due-soon, activity
│   ├── projects/
│   │   ├── page.tsx                           # project list
│   │   └── [projectId]/
│   │       ├── page.tsx                       # project overview — sprint list + backlog
│   │       ├── sprints/page.tsx               # sprint list
│   │       ├── sprints/[sprintId]/page.tsx    # sprint task board (kanban/list/table)
│   │       ├── backlog/page.tsx               # tasks not in any sprint
│   │       ├── activity/page.tsx              # per-project activity feed
│   │       └── tasks/page.tsx                 # legacy redirect → project overview
│   ├── activity/                              # global activity feed
│   ├── calendar/                              # team calendar + PTO
│   ├── gantt/                                 # Gantt / Timeline view
│   ├── workload/                              # capacity vs. assigned hours per member
│   ├── reports/
│   ├── proposals/                             # Estimator (client quotes) — merged scoping + quoting tool
│   │   └── [proposalId]/                      # editor tabs: Setup · Scope & risk (guided) · Line items (catalog/freehand) · Adjust · Review; PDF/Excel; Start project
│   ├── discovery/                             # MERGED into Estimator — both routes redirect → /proposals
│   ├── team/
│   ├── settings/                             # profile, time-off, admin team time-off
│   ├── tasks/page.tsx                         # top-level tasks entry
│   ├── error.tsx · loading.tsx               # route-level states
│   └── layout.tsx
├── error.tsx · not-found.tsx · page.tsx · layout.tsx
proxy.ts                                       # Next 16 root middleware — Supabase session refresh (no-op without env)
# NOTE: auth is wired to Supabase Auth via a bridge; auth-store mirrors the session for demo compatibility.
components/
├── ui/                 # shadcn/ui — generated components; avoid manual edits
├── common/             # help-tip, mine-team-toggle, password-input
├── features/
│   ├── auth/           # invite-hash-catcher
│   ├── dashboard/      # DashboardTeam (the Team view)
│   ├── projects/       # ProjectsPage, ProjectCard, Create/Edit/Delete modals
│   ├── proposals/      # Estimator: editor (Scope & risk + Line items tabs), StageBoard (Zoho pipeline kanban), CatalogBrowser, AddonsCard, DependencyAlert, PDF preview mock, access-denied
│   ├── discovery/      # guided-scope UI reused BY the Estimator (no standalone route): DiscoveryWizard, Gantt, HoursBreakdown, RiskBadge, Field
│   ├── sprints/        # ProjectOverviewPage, SprintCard, Create/Edit/Delete modals
│   ├── tasks/          # TasksPage, KanbanBoard/Column, TaskCard, TaskDetailDrawer, list/table views, comments, time tracker, modals
│   ├── gantt/          # GanttClient
│   ├── workload/       # WorkloadClient, MemberWeeklyHoursInput
│   ├── activity/       # ActivityFeedClient/List
│   ├── notifications/  # NotificationBell
│   ├── settings/       # ProfileForm, TimeOffSettingsSection, AdminTeamTimeOffSection, HourlyRatesCard, TimeOffApprovalDialog
│   ├── skills/         # MemberSkillsEditor, StarRating
│   ├── tour/           # HelpMenu (header ?), TourHost (welcome · nudges · Show me), GettingStartedCard, TourSettingsCard, use-tours
│   ├── team/           # MemberAccessDialog, PageAccessChecklist, WorkKeysEditor
│   └── esther/         # parked chat client (see "Esther is built but parked")
└── layouts/            # dashboard-header / -sidebar-nav / -mobile-menu / -mobile-tab-bar / -nav-config, workspace-page-header,
                        #   workspace-sync (hydrate + realtime), auth-provider, page-access-guard, sidebar-user-card, app-providers, app-atmosphere
hooks/                  # usePermissions, useAuth, useProjects, useSprints, useTasks, useTimeTrackingAccess, useNavAccess,
                        #   useTeamCalendar, useWeekLoggedHours, useZohoStageRefresh, usePbsClients, usePbsPoRefresh
lib/
├── utils/              # cn, dates, initials, activity-feed, gantt-layout, share-links, proposal-pdf/excel-export, availability-dates
├── validations/        # Zod schemas (profile.schema.ts so far)
├── dummy/              # demo data: projects, sprints, tasks (+ TEAM_MEMBERS)
├── constants/          # projects, sprints, proposal-estimator, workload, task-focus
├── proposal-catalog/   # catalog.json (built by scripts/build-catalog.mjs from the pricing workbook) + index
├── discovery/          # guided-scope rules engine (analyzeDiscovery) + to-proposal bridge + from-esther seed
│                       #   + team-calendar — booked PTO folded into the tentative timeline
├── activity/           # workspace-push (append activity/notifications)
├── collaboration/      # notify-task-activity
├── sync/               # estimate-project-sync — the two-way estimate ↔ project reconciler + cross-store registry
├── calendar/           # us-holidays — the 11 federal holidays + the observance rule (timeline, capacity, calendar)
├── availability/       # pto-impact — what an absence costs the plan (pure; drives the approval preview)
├── workload/           # assigned-work — the ONE definition of a person's open load + capacity (both workload views)
├── undo/               # offer-undo-toast (one-shot Undo)
├── tours/              # ids (data-tour anchors) · tours (all tour copy) · run (driver.js wrapper) · checklist (pure)
├── assignment/         # plan.ts (assignment planner: work keys, then skills) + roster.ts
├── pricing/            # hourly-rates.ts (rate rules) + line-pricing.ts (who does a line, what it costs)
├── zoho/               # OAuth tokens, write-allowlist, deal stages/products/packages, won-transition
├── pbs/                # tokens (mintOnce), endpoint allowlist, clients/directory, PO status
├── esther/             # parked brief engine
└── supabase/           # client.ts (browser), server.ts (API route guards), admin.ts (service role, server-only),
                        #   require-admin.ts, middleware.ts + config.ts + parse-error.ts — wired
store/                  # Zustand (live via WorkspaceSync + optimistic write-through; demo persists to localStorage):
                        #   projects, sprints, tasks, auth, team, availability, activity,
                        #   notifications, weekly-capacity, proposal-estimator, hourly-rates,
                        #   member-skills, esther, nav-drawer, tour
types/                  # project, sprint, task, proposal, availability, database (generated — `npm run db:types`)
docs/                   # data-mapping.md (data shapes) + backend-supabase.md + supabase-integration-plan.md
supabase/               # migrations/ 0001 schema · 0002 rls · 0003–0009 mentions/realtime/activity/storage/role-guard ·
                        #   0012/0014/0021 invite-only + pending state · 0015/0016/0017 workflow (proposal status, assignment lifecycle, time_entries) ·
                        #   0018 logged-hours guard · 0019/0020 offboarding (deactivate/hard-delete) · 0022 proposals.discovery ·
                        #   0023 migrate+drop discovery_projects · 0024 page-access heal ·
                        #   0025 notification actor · 0026 member_skills · 0027 security phase 1 ·
                        #   0028 zoho_connection · 0029 proposals.zoho · 0030 pbs_connection · 0031 proposals.pbs ·
                        #   0032/0033 tasks.source_line_item_id (estimate↔project sync key) ·
                        #   0034/0035 PTO approval (status + reviewer, self-approval guard, narrowed reads) ·
                        #   0036 risk_buffer_pct on proposals + projects ·
                        #   0037 publish scheduling tables to realtime (0038-0040 are wrong-theory
                        #   churn that nets to zero - see "Realtime" below) ·
                        #   0041 member-abuse fixes (leave approval, profile self-edit, internal-only hrefs) ·
                        #   0042 hourly_rates (role+level rates; pricing plan Phase 1) ·
                        #   0043 profiles.work_keys (admin-set lookup keys; Phase 4) ·
                        #   0044 risk_buffer_pct default 10 (new rows only) ·
                        #   0045 tour_progress (onboarding tours; self-only RLS) ·
                        #   0046 audit fixes (time entries admin-edit only, assignee
                        #   consent guard, deactivated = no role, one estimate per
                        #   project / PO / active deal, FK indexes) ·
                        #   0047 tasks.completed_at (trigger-stamped; on-time delivery) ·
                        #   0048 logged_hours derived from time_entries, entries survive a
                        #   task delete, feed rows server-stamped + length-capped
                        #   + README - `npm run db:push`
project-csv/            # Project_Pricing_Workbook_v3.xlsx — source for the catalog + hourly rates
                        #   (the older "tasks and integration.xlsx" is superseded)
e2e/                    # Playwright suite — `npm run test:e2e` (see e2e/README.md).
                        #   Runs against LIVE Supabase+Zoho, so: everything it creates is
                        #   prefixed "[E2E]" and deleted in teardown, it never touches
                        #   pre-existing data, and the Zoho PUSH is never automated.
                        #   Login uses a dedicated bot account (`npm run e2e:seed-user`).
```

> **Data layer:** live Supabase (`lib/supabase/` + `supabase/migrations/`) via the synced-store
> bridge when env vars are set; Zustand + `localStorage` + `DUMMY_*` is the demo fallback. Stores
> stay the single read seam for components either way. Backend plan:
> [docs/backend-supabase.md](docs/backend-supabase.md); shapes: [docs/data-mapping.md](docs/data-mapping.md).

---

## How the Backend Relationship Works

> **Backend = Supabase.** Full architecture, schema, RLS, and frontend wiring patterns live in
> [docs/backend-supabase.md](docs/backend-supabase.md) — read it before touching the data layer.
> (The earlier Laravel plan is retired.)

Unlike a separate-backend-dev setup, **we own the database.** Schema and Row-Level Security live
in this repo under `supabase/migrations/` and are applied with `npm run db:push`. There is no
REST contract to wait on — the frontend talks to Postgres through `supabase-js` (PostgREST),
scoped by RLS.

**Connection:** `@supabase/supabase-js` + `@supabase/ssr`, via the helpers in `lib/supabase/`:
- `client.ts` — browser client for Client Components.
- `server.ts` — server client for Server Components / Route Handlers / Server Actions; used by the API route guards (`lib/supabase/require-admin.ts`, `lib/zoho/guard.ts`, `lib/pbs/guard.ts`).
- `lib/supabase/middleware.ts` (+ root `proxy.ts`) — refreshes the auth-session cookie each request.

**Auth flow (Supabase Auth / cookie-based):**

1. User signs in with `supabase.auth.signInWithPassword(...)` (or OAuth / magic link).
2. `@supabase/ssr` stores the JWT in **httpOnly cookies** — no token in local/session storage.
3. Root `proxy.ts` refreshes the session cookie on every request. **Any response it returns must carry the cookies Supabase set** — `lib/supabase/middleware.ts` copies them onto every redirect and onto the API 401. A bare `NextResponse.redirect()` drops them, which silently logs people out: a rotated refresh token never reaches the browser (so the next refresh fails against a token Supabase already consumed), and a dead session never gets cleared. Verify with:
   `curl -sD- -o/dev/null -H "Cookie: sb-<ref>-auth-token=bad" localhost:3000/dashboard | grep -i set-cookie` — it must print a `Max-Age=0` clear.
4. RLS uses `auth.uid()` to scope every query automatically; on missing session, gate in middleware/UI.

**Running it (already wired):**

- Put a Supabase project's URL + keys in `.env.local` (see `.env.example`); with no env vars the demo fallback runs.
- `npm run db:push` applies `supabase/migrations/`, then `npm run db:types` regenerates `types/database.types.ts`.
- Each Zustand store is already connected to Supabase via the synced-store bridge (hydrate + optimistic write-through) behind `isSupabaseConfigured` — no per-feature swap needed.
- Keep `usePermissions()` in lockstep with the RLS policies (`0002_rls.sql` and later migrations).

---

## Key Architectural Decisions

**Why Next.js App Router (not plain React)?**
Route-based layouts, middleware for the Supabase session refresh + auth guards, server
components for lightweight rendering. This is the right call for a dashboard SaaS.

**Why Supabase (not a separate REST backend)?**
Postgres + Auth + RLS + Realtime + Storage in one, owned in-repo as SQL migrations. RLS pushes
authorization into the database (the UI's `usePermissions()` becomes a mirror, not the only gate),
and Realtime gives the collaborative surfaces (notifications, activity, board, comments) live
updates with little extra code. See [docs/backend-supabase.md](docs/backend-supabase.md).

**Why Zustand + a synced-store bridge (not Redux, not TanStack yet)?**
Each Zustand store hydrates from Supabase (via `WorkspaceSync`) and writes through optimistically with
rollback — one store is the single read seam for components in **both** live and demo mode. TanStack
Query is installed but **not** wired: the bridge already covers caching/dedupe, so it's only revisited
if a feature needs true server-state caching. Redux would add boilerplate this doesn't need.

**Why httpOnly cookies (not localStorage)?**
localStorage is readable by any JS — vulnerable to XSS. Supabase Auth via `@supabase/ssr` keeps
the session in httpOnly cookies, inaccessible to JavaScript, so the token can't be stolen via XSS.

**Why Zod for validation?**
Zod schemas serve dual purpose: TypeScript type inference AND runtime validation. One schema
gives you both the type and the validator. Works seamlessly with React Hook Form.

---

## Data Access Map (Supabase tables → hooks)

> Access is via `supabase-js` against these tables (defined in `supabase/migrations/0001_init.sql`),
> scoped by RLS (`0002_rls.sql`+). No REST endpoints. Stores hydrate live via `WorkspaceSync` and
> write through optimistically (the synced-store bridge). **Wired** = live when
> `isSupabaseConfigured`, with the demo (Zustand/local) path kept as fallback.
> Status: Demo (Zustand/local) | Wired (live Supabase; demo fallback) | —

| Table(s)                              | Reads / writes via         | Store / hook                | Status |
| ------------------------------------- | -------------------------- | --------------------------- | ------ |
| `auth.users` + `profiles`             | Supabase Auth + select     | `useAuth` + `auth-store` (bridge) | Wired |
| `projects`                            | select / insert / update / delete | `projects-store` / `useProjects` | Wired |
| `sprints`                             | select / insert / update / delete | `sprints-store` / `useSprints` | Wired |
| `tasks` (+ `task_assignees` w/ status, `source_line_item_id`) | select / insert / update / delete + Realtime | `tasks-store` / `useTasks` | Wired |
| `time_entries` (hour attribution)     | select / insert                   | `tasks-store` (logged via accepted assignees) | Wired |
| `task_comments` (+ `comment_reactions`)| select / insert / update / delete + Realtime | `tasks-store` / `TaskCommentSection` | Wired |
| `profiles` (team directory + `work_keys`) | select / update (keys: admin only) + Realtime | `team-store` / `useTeamMembers` (`setWorkKeys`) | Wired |
| `notifications`                       | select / insert / update / delete + Realtime | `notifications-store` | Wired |
| `activity` (workspace log)            | select / insert + Realtime | `activity-store`            | Wired |
| `availability_entries` (+ `status` approval) | select / insert / update / delete | `availability-store` (calendar, Settings time-off, **and Workload capacity** — a day off removes `weeklyHours / 5` from that week via `awayWorkdaysInWeek` + `capacityAfterTimeOff`; Mon–Fri only, `partial` counts half) | Wired |
| `weekly_capacity`                     | select / upsert            | `weekly-capacity-store` (workload) | Wired |
| `hourly_rates` (responsible + level -> rate) | select / upsert + Realtime | `hourly-rates-store` (Settings -> Workspace -> Hourly rates) | Wired - new estimate lines snapshot these rates |
| `proposals` (`line_items` + `addons` + `discovery` jsonb) | select / insert / update / delete | `proposal-estimator-store` (Estimator) | Wired |
| Storage `avatars` bucket              | upload / getPublicUrl      | `ProfileForm` → `profiles.avatar_url` | Wired |
| `zoho_connection` (OAuth tokens)      | service-role only (RLS: **no policies**) | `lib/zoho/tokens.ts` via `/api/zoho/*` | Wired |
| `proposals.zoho` (CRM link jsonb)     | select / insert / update   | `proposal-estimator-store` (deal/account/contact link) | Wired |
| `proposals.pbs` (PO link jsonb)       | select / update            | `proposal-estimator-store` (Create PO, PO status refresh) | Wired |
| `pbs_connection` (PBS token cache)    | service-role only (RLS: **no policies**) | `lib/pbs/tokens.ts` via `/api/pbs/*` | Wired |
| `member_skills` (skill + 1–5 stars)   | select / upsert / delete   | `member-skills-store` (Team → star button) | Wired |
| `tour_progress` (tour seen: version + completed/dismissed) | select / upsert / delete (self only) | `tour-store` (? menu, welcome, checklist dismissal) | Wired — no realtime, on purpose |

**Server-side proposal export** (`GET /proposals/:id/export` in the old plan) → still optional; a
Supabase **Edge Function** → Storage bucket. The client-side jsPDF/xlsx export works today and is unchanged.

---

## Data Models

> Keep these in sync with `types/*.types.ts`. Update as models evolve.

**Hierarchy:** Project → Sprint → Task (tasks without a sprint live in the backlog)

```ts
// Core entities — abbreviated for context

interface User {
  id: string; // UUID (auth.users / profiles.id). Demo mode uses "1".."6".
  name: string;
  email: string;
  role: "admin" | "manager" | "member" | "viewer";
  avatar_url?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: "active" | "completed" | "archived";
  owner_id: string; // UUID → profiles.id
  created_at: string;
  updated_at: string;
}

interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal?: string;
  status: "planning" | "active" | "completed" | "cancelled";
  start_date: string;
  end_date: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "in_review" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  assignee_ids: string[]; // UUID[] → profiles.id (task_assignees join)
  reporter_id: string;    // UUID → profiles.id
  project_id: string;
  sprint_id?: string | null;  // null = backlog
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  tags: string[];
  position: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null; // stamped by trigger when status enters done (0047)
  comments: Comment[];
}

// Proposal estimator uses `ClientQuote` (see types/proposal.types.ts), not this
// old placeholder. Abbreviated:
interface ClientQuote {
  id: string;                 // UUID (demo: quote-N)
  title: string;
  project_id?: string | null; // optional → projects.id (set on Start project)
  client_name?: string;
  platform: ProposalPlatform;
  status: "draft" | "sent" | "approved" | "rejected"; // approval lifecycle
  line_items: ProposalLineItem[]; // JSONB in the proposals table
  addons: ProposalAddons;         // JSONB roll-up (PM/responsive/design/QA)
  requirements_unclear: boolean;
  discovery?: DiscoveryProject | null; // guided questionnaire answers (JSONB); null = catalog/manual quote
  created_at: string;
  updated_at: string;
}
```

---

## Estimator (Discovery + Proposals, merged)

**Purpose:** One coordinator-facing tool to **scope and quote** client work. It replaces what were two separate tools — a *Discovery* scoping wizard and a *Proposals* estimator — merged into one so a work list is entered **once** and flows forward. The document is a `ClientQuote`; a quote becomes a real project later via **Start project**. See `docs/workflow-revamp-plan.md` and the `estimator-merge` memory note.

**Two ways to scope one work list (both produce `line_items`):**

- **Guided** — "Start guided scoping", then answer the questionnaire (the former Discovery wizard, 67 fields — anything the Setup tab already knows is mirrored by `syncDiscoveryToQuote`, never re-asked: title/client, and what the platform implies, e.g. Shopify ⇒ e-commerce + goal + hosting). The rules engine (`lib/discovery`, `analyzeDiscovery`) computes **Min/Mid/Max** hours per phase, a **timeline/Gantt**, and a **risk score**; **Generate line items** turns that estimate into the quote's line items (via `regenerateLineItems` → `proposalDraftFromDiscovery`). Primary Business Goal is context only — not required, drives no hours or risk, printed on the PDF/Excel/preview meta block. The answers are stored on the quote as `discovery` (JSONB); risk/timeline are derived on the fly, not stored.
- **Catalog / manual** — import **catalog rows** (`ProposalCatalogBrowser`, per platform, grouped by module) or add freehand lines.

**Section help ("?" in each section's top-right corner).** Every page header
(`WorkspacePageHeader`'s `help` prop) and every main section on every page has
a click popover explaining it in plain words. Non-Estimator copy is in
**`components/common/app-help.tsx`** (`<AppHelp section="page.…" />`). Every
Estimator section has one too — Quote details,
the guided summary / empty state / tentative timeline, Line items,
Requirements not pinned down, Risk buffer, Rates, Roll-up add-ons, Totals,
Client preview. All the copy is in **`components/features/proposals/estimator-help.tsx`**
(one voice, one place); the button is the shared **`SectionHelp`**
(`components/common/section-help.tsx`) — a Popover, not `HelpTip`'s hover
tooltip, because it has to open on a phone. In a card header it goes in
`<CardAction>`; a headerless card uses `corner` (`absolute right-4 top-4`, the
same spot CardAction lands) and gives its content `sm:pr-12`.

> **On a phone only the FIRST LINE makes room for the "?"** — never the whole
> section. Reserving the space on the whole column left an empty strip down
> the right of every header, card and list at 375px. So: a page header pads
> only its eyebrow + `h1` (`max-sm:pr-8`); a corner card pads only its title
> line (`max-sm:pr-8`) and keeps `sm:pr-12` for the rest; and a CardAction
> header lets everything but the title span the full width under `sm`
> (`globals.css`, scoped to `max-width: 639.98px`). All of it resolves to the
> old classes from `sm` up — verified pixel-identical (2,058 elements on 16
> views at 768 and 1280) against the previous layout. **The copy restates
behaviour: change it in the same commit as pricing / add-ons / buffer / Zoho
send**, like the tour copy.

> **Every space beside a `<strong>`/`<em>` is an explicit `{" "}`.** The
> compiler drops it when the neighbouring JSX text holds an entity
> (`&apos;`): `work?</strong> It isn&apos;t` rendered "work?It isn't" while the
> source looked fine. `e2e/estimator-help.spec.ts` checks the source and the
> rendered text of every popover (with a negative control).

**Editor tabs (`ProposalEditorClient`):** Setup · **Scope & risk** (guided questionnaire + Hours + Timeline/Gantt + "Generate line items") · **Line items** (catalog/freehand) · **Adjust** (add-ons + totals) · **Review** (PDF/Excel). **Every estimate has both tabs** — the New-estimate dialog does *not* ask which one you want, because the choice was never binding: it only picked a landing tab. A new estimate starts on **WordPress** (`DEFAULT_PLATFORM`, `lib/proposal-catalog/index.ts` — the New-estimate dialog and the store's fallback both read it) and opens on Line items with a starter row; **"Start guided scoping"** (Scope & risk empty state) attaches the questionnaire whenever it's wanted, mirroring the platform via `syncDiscoveryToQuote`. An estimate that arrives *with* answers (Esther brief) still opens on Scope & risk.

**Pricing (per line, pricing plan Phase 3):** a line's price is **its effective hours × its own `rate`** — the rate of its **role + level** (`responsible` + `level`, e.g. IT Level 2), **snapshotted onto the line when it is added**. Editing a rate in Settings therefore never reprices an existing quote (plan decision 1); the Adjust tab's **`QuoteRatesCard`** says when today's rates would change the price and offers **"Update to current rates"** behind an old → new preview, writing the same object it rendered (`repriceToCurrentRates` → `applyCurrentRates`, one store write for `line_items` + `addons.rates`). Add-on hours are priced at their role's Level 1 rate (`ADDON_ROLE`: Responsive → IT, Design → Creative, QA → QA Tester, PM → Project Manager), snapshotted as `addons.rates`. The money helpers are **`lineAmount` / `quotePricing` / `formatAmount` / `splitAmount`** (`lib/constants/proposal-estimator.ts`); who-does-what is **`lib/pricing/line-pricing.ts`** — every line is created through **`withPricing`** (catalog row's role → guided phase's role via `PHASE_ROLE` → freehand IT Level 1). Each line is **rounded to whole dollars** and the total is the sum of those, so the PDF/Excel lines always add up to the header. The header reads "708 h at $100/h" when one rate prices every hour, "avg $104.25/h" otherwise (`rateSummary`). The coordinator can change a line's role in its details panel, which snapshots that role's rate **as of now**. **Client documents (PDF, the in-app preview, Excel) show prices only — never a role, level or rate.**

> **A line with no `rate` is priced at `LEGACY_HOURLY_RATE` ($100)** — that
> is what every line cost before Phase 3, so a legacy quote reads identically
> with or without its snapshots (proven over 3,000 random quotes in
> `e2e/line-pricing.spec.ts`). The live data was nevertheless backfilled once
> (`scripts/backfill-line-pricing.mjs`, 2026-09-24: 6 quotes / 208 lines at
> $100 + roles; every price verified unchanged), so the DATA says what each
> line was priced at and "Update to current rates" knows each legacy line's
> role. Those quotes now show that button on their Adjust tab — pressing it is
> a pricing decision about a real client quote, never a migration step.
>
> `responsible` / `level` / `rate` ride **inside** the `line_items` jsonb and
> `rates` inside `addons`, so no whitelist changed. A new top-level `proposals`
> column still needs all three (`rowToQuote`, `quoteUpdatePayload`, the `Pick`).

**Products → Packages rows:** products picked from the CRM (`zoho.products`) get an hours share **derived** from the estimate — `splitHours(total, n)`, even, with rounding drift on the first share so the parts always sum to exactly the total. Nothing is typed: the estimator computed the hours, and a second hand-entered copy could only disagree with it. A row's price is its share of the estimate's **amount** (`splitAmount`, same drift rule, so the rows sum to exactly the header price) — **computed, not the catalogue `unit_price`** (kept for reference only). The Setup table and the create-deal dialog both render from the same call, so the review can't disagree with what's sent. These rows are written onto the Deal's Packages subform by `lib/zoho/deal-estimate-sync.ts` (see "Estimate → Deal content" under Zoho).

**Hourly rates by role + level (pricing plan — `docs/pricing-levels-plan.md`).**
Rates are **data** (the old `HOURLY_RATE` constant is gone). Table
`hourly_rates` (`0042`), keyed `(responsible, level)`, seeded from
`project-csv/Project_Pricing_Workbook_v3.xlsx` — IT 100/120, Creative 100/130,
Project Manager 80/100, QA Tester 80/120, **Project Coordinator 0/0 on purpose**
(non-billable, still configurable). Edited in **Settings → Workspace → Hourly
rates** (`HourlyRatesCard`): admin edits, manager reads, members and viewers see
nothing (RLS + `canViewHourlyRates` / `canEditHourlyRates`). Pure rules live in
`lib/pricing/hourly-rates.ts` (`rateFor`, `rateKey` = the workbook's
`"IT|Level 2"`, `validateRateDraft`, `DEFAULT_HOURLY_RATES` for demo mode).

> **Estimates price from this table** (Phase 3, see "Pricing" above) — but
> only NEW lines: each line snapshots its rate when it is added, so editing a
> rate here never reprices an existing quote. The card says so.
>
> **"Level 2 must not be below Level 1" is checked on Save across the whole
> table, not by a database trigger** — raising both levels of a role one row at
> a time would briefly break a row rule and be refused half-way. Equal is
> allowed (Coordinator is $0/$0). `updated_by` / `updated_at` are stamped by a
> trigger, never sent by the client, so "last changed by" cannot be forged
> (probe P13 sends someone else's id and checks it is overwritten).
>
> The old Workspace-tab **"Placeholder layout — no API yet"** card was removed;
> the Workspace tab is now shown only to admin + manager (a member or viewer
> would land on an empty tab). The **Security** tab is still a mock (disabled
> password field) — flagged, not removed.
>
> **Phone width:** the admin table is role + two inputs; at `w-28` that is
> ~333px against a phone card's ~311px, so inputs are `w-24 sm:w-28`
> (measured: 0px overflow in 317px). Settings opens on the Profile tab, which is
> why `layout-integrity` does not see this card — check it by hand after edits.

**Line-item math:** `base_hours × tierMultiplier × quantity` — **Basic 1× / Advanced 1.5× / Custom 2×** (`TIER_MULTIPLIERS`). **Roll-up add-ons** compound on dev hours: `responsive = dev × pct` → `design = (…) × pct` → `qa = (…) × pct` → `pm = (…) × pct` (defaults PM 10 / Responsive 25 / Design 35 / QA 20 %, each toggleable — `DEFAULT_ADDONS`). Guided estimates ship with add-ons **off** (phases already itemise design/QA/PM).

**Approval → project:** a quote has a `status` (**draft → sent → approved/rejected**). When **approved**, **Start project** opens a **two-step dialog**: options → **Review schedule** (`previewConversion` computes sprints/tasks/assignees/dates and writes **nothing**) → **Confirm & create**. The reviewed `SchedulePreview` is passed back into `convertToProject`, which persists **exactly** what was shown rather than recomputing (roster/PTO could change mid-review). "Sync schedule from estimate" on a project uses the same preview → confirm flow via `previewSchedule` + `regenerateSchedule`, and since `0032`/`0033` that sync **reconciles** rather than only adding — see "Estimate ↔ project, both ways" below. `convertToProject` creates a real project and **scaffolds the tentative timeline into sprints** — one sprint per estimate phase (status `planning`, carrying the phase's computed start/end dates), with each seeded task slotted into its phase's sprint (join key = `phaseLabelForLineItem` ↔ `PHASE_META[id].label`).

> **Every project starts here (decided 2026-10-12).** Blank projects are
> switched off: `BLANK_PROJECTS_ENABLED = false` (`lib/constants/projects.ts`)
> disables **New project** on /projects (shown, with its reason in a tooltip,
> the tour step and the empty state) and hides the header shortcut, the
> + menu's *Create project* and the dashboard quick action. Flip the constant
> to bring them back. An estimate can no longer be pointed at an existing
> project either: the New-estimate dialog has no project picker and the
> editor's *Internal project* is a read-only link — the link is made by Start
> project only, one estimate per project (`0046`'s unique index). Two estimates
> on one project made Sync schedule delete the other's tasks as "removed lines".
>
> **Seeded assignees are told.** The live path inserts `task_assignees`
> straight through supabase (not `createTask`, which notifies per task), so
> `seedAssignments` sends each person ONE bell notification — "assigned you N
> tasks on "Project" — accept or decline" — linking to the project. Start
> project and Sync schedule both go through it.

> **A line's phase is its guided phase, else its ROLE's** (pricing plan
> Phase 5, `phaseIdForLineItem` in `lib/discovery/from-line-items.ts`). A guided
> row's `module` is one of the 7 `PHASE_META` labels and keeps it. Every other
> row — catalog or freehand — goes to the phase of whoever does it
> (`ROLE_PHASE`): **Creative → Design & UX, QA Tester → QA & Testing, Project
> Coordinator → Content & Copy, Project Manager → Discovery & Strategy**; IT,
> an unknown role and a row with no role → **Development** (where every catalog
> row sat before). The **59 catalog modules** ("Homepage - Standard", "SEO"…)
> are still a scope taxonomy only — they group rows in the Line items tab and
> the PDF and decide nothing about dates.
>
>  - **`resultFromQuote` builds a catalog quote's phases from the same rule**,
>    so a Creative line now draws a Design bar (plus the design add-on, whose
>    roll-up task comes first), a QA line a QA bar. Totals are unchanged: the
>    non-dev phases are summed and Development takes the remainder of
>    `devHours`. With no role phases the old arithmetic is kept EXACTLY —
>    not re-rounded — because durations round UP to whole days, and removing
>    float noise would shift an existing timeline by a day. Verified
>    byte-identical (full result, dates included) against the pre-Phase-5 code
>    on 200 random IT-only quotes; `e2e/role-phases.spec.ts` pins it.
>  - **The `available` guard.** A GUIDED quote's sprints come from its
>    questionnaire, not its lines, so a Creative catalog line on a guided quote
>    with no design phase would have no sprint and land in the **backlog**.
>    Every store call that places, tags or plans lines for one operation takes
>    the same `phaseSetOf(scaffold)` set (a re-sync adds the project's existing
>    sprints), and a role phase missing from it falls back to Development. One
>    set per operation is the point: sync's preview is built from the NEW
>    phases only, and deriving the set per call would let the preview and the
>    write place a line differently.
>  - **Existing tasks are never moved.** A re-sync adds new sprints for new
>    phases (shown in the preview first) and places NEW tasks by role, but a
>    task that already sits in a sprint stays there — the manager may have put
>    it there. Live on 2026-09-24 this affected two Creative catalog lines on
>    test estimates, one on a project (whose task stayed in Development).
>  - The PBS PO range (`estimateDateRange`) follows automatically — it is the
>    same analyzer — so a catalog quote with design work bills a longer range.

This is a **draft schedule** the manager then adjusts (sprint dates, task hours/assignees) into the plan the team follows — the project's timeline **is** its sprints, rendered by the Gantt (embedded on the project overview via `<GanttClient lockedProjectId={…} />`). Links `proposals.project_id`.

> **A sprint may start and end on the same day.** Both sprint modals
> validate `end >= start`, not `end > start`. The estimate scaffolder
> (`convertToProject` / `regenerateSchedule`) inserts sprints straight through
> supabase and never sees that schema, so it already produces one-day sprints —
> two exist live. With the strict `>` those sprints could not be saved from the
> Edit modal at all: renaming one failed validation on dates nobody had touched.
> Any rule that only one of the two writers enforces will drift like this.

**Schedule risk buffer.** `risk_buffer_pct` (0–100, migration `0036`) sits on
**both** `proposals` and `projects`. A coordinator sets it on the Estimator's
**Adjust** tab; `convertToProject` carries it onto the project, whose own page
can re-forecast and apply it. **New estimates and new projects start at 10%**
(`DEFAULT_RISK_BUFFER_PCT`, and `0044` makes it the column default so every
insert path agrees); existing rows kept their buffer, since changing it would
move dates people had agreed to.

> **A project made by Start project starts at 0%, not its estimate's
> buffer.** The scaffolded sprints already carry the estimate's buffer — their
> dates come from `computeTimeline` with it applied — so copying the percentage
> as well made the project page forecast a SECOND buffer on top, and **Apply**
> would have stretched an already-buffered plan again (20% twice is 44%). The
> buffer travels as dates, exactly as **Apply** leaves it on a hand-made project.

> **It stretches the TIMELINE and nothing else.** Hours are untouched, so
> the price is untouched. The distinction is the whole reason it is a separate
> control:
>
> | Control | Effect | Kind of decision |
> | --- | --- | --- |
> | `requirements_unclear` | prices every line as Advanced (1.5x) | **pricing** — more hours, more money |
> | `risk_buffer_pct` | same work, expected to take longer | **scheduling** — dates only |
>
> They sit next to each other on the Adjust tab precisely so the contrast is on
> screen, and the card says "moves dates only" in as many words. Folding risk
> into hours would quietly inflate a client quote, and there is already a
> control that does that on purpose. `regenerateLineItems` deliberately does
> **not** pass the buffer — it turns an estimate into line items, and the buffer
> must never reach them.

 - **"Requirements not pinned down" must be visible wherever it moves a
   number.** QA read "368–568 hrs" on Scope & risk and "708 h" on Line items
   and could not reconcile them: the lines summed to 472 h, and the box —
   ticked on the Adjust tab — priced every one as Advanced. Nothing on either
   screen said so. All three tabs now state it: Scope & risk ("Line items: 472
   h, quoted at 708 h … Change"), the Line items bar ("472 h at own tiers →
   708 h") and the checkbox itself, which also previews its effect *before*
   it is ticked. Both figures are `quoteDevHours` with the flag forced off/on,
   so they cannot disagree with the price. It is worded "priced as Advanced",
   never "× 1.5": the box forces every line TO Advanced, so a Custom (2×) line
   goes down. With the box on, a guided quote can land above the estimate's
   own Max (708 vs 568 here) — by design, but a pricing decision worth knowing.
 - **Build a sentence that contains numbers as ONE string expression.** JSX
   drops whitespace beside an `{expression}` whenever the formatter wraps the
   line there, so `quoted at {devHours} h` rendered "708h", then "708 h—" as
   the line moved. `{`quoted at ${devHours} h — …`}` has no JSX whitespace to
   lose. (Playwright's `reuseExistingServer: true` means a long-running dev
   server serves hot-reloaded code, which made the intermediate states
   confusing to read.)
 - **Applied by scaling every offset**, starts included, in `computeTimeline`.
   Buffering only the END offsets would leave each phase finishing later while
   the next still began on its original day — the plan has to stay continuous.
   Offset 0 scales to 0, so the project still starts when it starts.
 - `DiscoveryTimeline` now carries **`baseBusinessDays`** (pre-buffer) and
   **`riskBufferPct`** alongside `totalBusinessDays` (post-buffer), so the Gantt
   can say "54 business days (incl. 20% risk buffer on 45)" rather than just
   looking bigger than the hours justify.
 - **On a project it is a FORECAST first.** The section under the Gantt always
   shows "planned finish / with buffer"; changing the percentage moves nothing.
   **Applying** it rewrites real sprint dates, so it goes through a preview and a
   confirm — sprint dates are the plan the team follows, and nothing in this app
   overwrites them silently. `bufferSprintDates` re-anchors every sprint against
   the project start so order and gaps hold.
 - **Applying resets the buffer to 0%.** It is now part of the dates, and a
   20% buffer applied twice is 44% — which nobody asked for.
 - `proposals.risk_buffer_pct` needed **all three** whitelists
   (`rowToQuote`, `quoteUpdatePayload()`, the `Pick<ClientQuote, …>` on
   `updateProposal`), and `projects` needed `rowToProject` + the `updateProject`
   field list.

**Estimate ↔ project, both ways.** Once a quote has become a project the two are
kept in step, keyed on **`tasks.source_line_item_id`** ↔ `proposals.line_items[].id`
(migrations `0032`/`0033`; the column is **`text`**, because a line-item id is
`uid()`'s `${Date.now()}-${base36}`, not a uuid). All of it lives in
**`lib/sync/estimate-project-sync.ts`**.

 - **Estimate → project** is `diffEstimateToProject()`, reached through the
   existing preview → confirm dialog: line items with no task are **created**,
   renamed ones **rename** their task, re-houred ones **re-hour** it, and a
   deleted one **removes** it. The `SchedulePreviewPanel` shows the renames,
   `12h → 18h` changes and (in red) the removals before anything is written.
   This replaced an **additive-only** rule that matched on the task's
   **title**: renaming a line item produced a *second* task, deleting one
   orphaned its task forever, and changing its hours did nothing at all.
 - **Project → estimate** is immediate **until the estimate is approved or
   billed** (`quoteIsFrozen`: `status === "approved"` or any PO). From then on
   the quote is the price the client agreed to and the project is the plan, so
   a task edit stays on the project and the coordinator is told once per quote
   per session. Start project requires approval, so in practice the mirror only
   runs for an estimate moved back to draft/sent. Sync schedule (estimate →
   project) is unaffected — it is previewed and confirmed. Before that, a
   seeded task's title or `estimated_hours` changing — or the task being
   deleted — writes back onto its line item. Hours go back through **`base_hours`**, never onto the
   derived `hours`, or the next recompute silently undoes them; and the
   inversion must honour **`requirements_unclear`**, which prices *every* line
   as Advanced (1.5x).
 - **A task with a NULL `source_line_item_id` is somebody's own work** and is
   never renamed, re-houred or deleted by a sync. That is also why `0033`'s
   backfill only linked titles matching **exactly one** line item (46 of 71).
 - **A task with LOGGED TIME is never deleted by a sync** — it comes back as
   `orphaned` and the preview keeps it, in amber, saying how many hours are on
   it. Since `0048` deleting a task no longer erases its time entries (they
   detach — `task_id` becomes NULL — and still count for the person), but the
   hours would stop belonging to any task on this project, and a task the team
   worked on should not vanish because a line left a quote. Scoping a line out
   of a quote is a pricing decision; the work that happened is not.
 - **The mirror is revertible, because the task write it follows is
   optimistic.** `mirrorTaskChange()` returns a **revert** closure and
   `tasks-store` calls it from every rollback path — the live update failure,
   the live delete failure, and both demo Undo toasts. Without it a request the
   server refused would still have dropped a line item from a client quote, or
   repriced one, with the project already rolled back and nothing on screen
   saying so.
 - The bridge is a **registry**, not an import: `proposal-estimator-store`
   imports `tasks-store`, so the tasks store calls `mirrorTaskChange()` and the
   estimator store registers the handler. The estimate→project half runs inside
   **`withMirrorSuppressed()`** so it cannot echo back. It is a silent no-op for
   a Member/Viewer — RLS scopes `proposals` to admin+manager, and the write
   would be refused anyway.
 - **The timeline has one source of truth.** Once a quote has a project, the
   editor's Timeline tab renders the **live project Gantt**
   (`<GanttClient lockedProjectId>`), not the estimate's tentative scaffold —
   drawing both is how the two pages came to disagree the moment a manager moved
   a sprint. Existing sprint **dates are never overwritten** by a re-sync; the
   scaffold is a draft the manager adjusts, and silently reverting that is worse
   than drift.
 - **Downstream:** a repriced estimate shows up in Zoho through the existing
   amber **CRM amount** badge and the send dialog's `$old → $new` — the push is
   still a deliberate button. **PBS cannot be told at all** (no update and no
   delete endpoint exists for a PO), so `poScheduleDrift()` compares the PO's
   stored `start_date`/`end_date` against the project's real sprint range and the
   PO badge gains a "· dates changed" note for someone to fix by hand.
 - **The PBS notice fires at the moment of the edit, not only on the badge.**
   Sprint dates *are* the project's range, so `sprints-store` calls
   `notifyProjectScheduleChanged(projectId)` on create, delete, and any
   **start/end date** change (not a rename or a status flip — those move
   nothing). `regenerateSchedule` calls it too, explicitly: the **live** path
   inserts sprints straight through supabase rather than `createSprint()`, so it
   never fires the sprint store's own notice and a sync that adds a phase would
   have extended the project past its billed range in silence. The estimator store's `registerScheduleWatcher` handler warns with
   both ranges, and dedupes on the resulting range so editing three sprints in a
   row is **one** toast rather than three. Without it the drift was only
   discoverable by going back to the estimate, which is the one place nobody
   looks while rescheduling.

> **Esther is built but parked.** `components/features/esther/` holds a working
> chat client (message list, composer, empty state) over `lib/esther/engine`
> (`analyzeBrief` → `discoveryFromEstherAnalysis` → a seeded estimate), but the
> `/esther` route deliberately renders a "coming soon" card and the sidebar
> marks it *Soon*. Nothing imports `EstherClient` — wiring it in is one line in
> the route, and a product decision rather than a bug.

**Output:** in-browser **PDF preview mock** + real **PDF** (jsPDF) and **Excel** (xlsx) export — `lib/utils/proposal-pdf-export.ts`, `proposal-excel-export.ts`. Optional server-side export (Edge Function → Storage) is still a later path.

**Data:** `store/proposal-estimator-store.ts` (Zustand + persist demo key `timeline-proposal-estimator`; live via the `proposals` table — `line_items` + `addons` + `discovery` as JSONB). The old standalone `discovery_projects` table was migrated into `proposals.discovery` and dropped (`0022`–`0023`).

**Catalog source (v3):** `project-csv/Project_Pricing_Workbook_v3.xlsx` →
**`node scripts/build-catalog.mjs`** → `lib/proposal-catalog/catalog.json`, then
**`node scripts/remap-catalog-categories.mjs --apply`** (dry run without the
flag). The old catalog was a one-off conversion from `tasks and
integration.xlsx` with no script behind it — which is how the spreadsheet and
the app drifted. 597 tasks over six platforms, 23 categories. Each task now
carries **`responsible`** + **`level`** (the lookup key into `hourly_rates`) and
**`things_to_consider`**; the catalog browser shows them and filters by role and
level, and shows each task's current rate (the rate a line added now would
snapshot).

 - **Categories were RE-CLASSIFIED, not just renumbered** (19 → 23). Every
   old "Design" task is now "Frontend"; old "Integration" split five ways. So
   an old→new id table by name is wrong — existing lines are remapped through
   their own `catalog_id` by `remap-catalog-categories.mjs`. It writes only
   `category_id`, never sends `updated_at` (no list reshuffle, no PDF that looks
   "edited"), and skips any quote saved while it ran. First run: 17 lines on two
   TEST estimates; hours, line counts and `updated_at` verified unchanged.
 - **Never compare a category against a literal id** — use
   `categoryIdByName()`. Esther checked `category_id === 5` for e-commerce; 5
   is Custom Tools in v3.
 - The build **normalises en/em dashes to "-"** in module and task names (the
   workbook writes "Configurator – 3D"; the catalog always said "Configurator -
   3D"), **renumbers duplicate ids** (React-NextJS reused 121–123, so ticking one
   task in the browser ticked its twin too — now 135–137), and **refuses to
   write** if a task names an unknown role, level or category. Output is
   deterministic, and task counts and hours match the workbook's Summary tab.
 - **The workbook's "Base Hours unchanged" is not quite true:** WordPress
   Hero Section 2 → 1.5 h and Services or Product Grid 3 → 2.5 h; task 117 moved
   module General → Environment Setup. Existing quotes are unaffected — a line
   stores its own `base_hours` when it is added.

**Permissions:** **Admin + Manager only** — gate with **`canExportProposals`** from `usePermissions()`. Member/Viewer must not see entry points or mutating controls. Enforced by RLS on `proposals`.

---

## Zoho CRM Integration

**Connection.** Server-side OAuth2 authorization-code flow. One **admin** connects once
(Settings → Workspace → Connect Zoho CRM); the refresh token is stored **workspace-wide** in
`zoho_connection` (migration `0028`, singleton row) and every later call reuses it — no end user
ever sees a Zoho screen. Routes: `/api/zoho/connect` · `/callback` · `/status` · `/disconnect` · `/org`.

**Token security.** `zoho_connection` has **RLS enabled with NO policies** — anon/authenticated
cannot touch it; only the service-role key (server routes) can. Tokens must never reach the
browser; `/api/zoho/status` returns metadata only. `lib/zoho/tokens.ts` exposes `getAccessToken()`
(auto-refreshes ~1 min before the 1 h expiry) and **`zohoFetch(path)`** — use that for any new call.

**Scopes are frozen at consent** — a live connection keeps whatever it was granted
until someone Disconnects and Connects again; changing `ZOHO_SCOPES` only affects the *next*
consent screen. Because re-consent needs an admin **with Zoho edit rights on the module**, the
production set (in `.env.example`) is deliberately **broad and requested once**: read +
create/update across modules, attachments, `coql`, `bulk`, `notifications.ALL`. **Never
requested at any tier: any `.DELETE`, `modules.ALL`, or `settings.ALL`** — a deleted CRM record
has no undo, and `.ALL` implies DELETE. (`notifications.ALL` is the exception and is safe: it
covers webhook *channels*, not records.)

> The scope string is **not** what limits this app. **`lib/zoho/write-allowlist.ts`** is:
> `zohoFetch` refuses any non-GET that isn't on it, before the request leaves the process.
> Today that's exactly three writes — create a deal, move a deal's stage, attach a file to a
> deal. Adding a write means adding a line there, which is the point: it shows up in review.

**Features consuming CRM data** (both gated admin+manager by `requireZohoReader()` — CRM records are PII):

| Feature | Route | What it does |
| ------- | ----- | ------------ |
| **Deal → Estimate import** | `/api/zoho/deals` | Estimator → "Import from Zoho": pick a Deal (by stage — *Proposal Requested* is the quote trigger — or free-text) → creates a pre-filled quote, **and advances the Deal to "Discovery"** (see the push row: scoping starts here, so the CRM says so). Linking a deal to an existing quote from the editor does the same |
| **Deal refresh (Zoho → app)** | `/api/zoho/deals/stages` | Opening the Estimator list or an estimate re-reads the linked Deals' `Stage`, `Amount` **and Packages row count** in one batched call (`useZohoStageRefresh`) and stores stage/amount only when they actually changed — writing every view would bump `updated_at` and reshuffle the list. This is what keeps `ZohoStageBadge` honest when **sales** moves a deal; there is no push/webhook (that needs `ZohoCRM.notifications.ALL` + re-consent + a channel-renewal cron). Zoho has no by-ids read on our scopes, so it fans out over single-record GETs, capped at 25. **`Amount` is stored, never applied**: it is Zoho's number (derived from the Packages subform) and the estimate's line items are this app's, so a CRM reprice shows up beside the estimate — amber, on the Setup panel — instead of silently rewriting it. The row count is what lets the send dialog say how many rows it is about to replace — and it is `null`, never `0`, when the subform can't be resolved: reporting 0 there would tell the dialog "nothing to replace" and drop the warning before an irreversible overwrite |
| **Products** | `/api/zoho/products` | Estimator → Setup → "Add from Zoho": the live **Products** module behind category filter pills (same pattern as the deal picker), multi-select, stored on the quote as `zoho.products`. Covered by the existing `ZohoCRM.modules.READ` — no new scope, no CSV snapshot. Records are fetched **without** a `fields` filter because this org files products under two things: the standard `Product_Category` (Creative/Sysdev/Phone/…) **and** a custom `CATEGORY` field (ONBOARDING/SEO/…), whose API name can't be assumed — `lib/zoho/products.ts` picks both out case-insensitively and groups by the custom one first. Picked products become the Deal's Packages rows (see "Estimate → Deal content") |
| **Client lookup** | `/api/zoho/accounts` | "Find in Zoho" on the Client field — available in **both** the New-estimate dialog and the editor's Setup tab. Search **Accounts** (companies), then pick a **Contact** (a company has many). Falls back to searching people when no company matches. Each company shows its **prior deals** — enriched with ONE batched `Account_Name:in:<ids>` query (never per-account: that would be 25 calls per search) |
| **Create deal** (write) | `POST /api/zoho/deals` | The inverse of import: a hand-made estimate opens a **new** Deal. **One button does both directions**: editor **Review** tab → **"Send to Zoho"** creates the deal when none is linked and updates the linked one when there is (`ZohoSendDialog`), always behind a preview of exactly what will be written. Deliberately the last step, and deliberately not two buttons in two places — which of the two you needed was bookkeeping the user shouldn't have to work out. Setup only offers *linking* an existing deal. Writes `Deal_Name`, `Stage`, `Closing_Date`, `Account_Name`, optional `Contact_Name` + `Description` — never `Amount`/`Quote_number`. **Requires an existing Account** (`zoho.account_id` via "Find in Zoho"); this app never creates a company. Stage is limited to `Discovery` or `Proposal Sent`, and **the proposal PDF is attached either way** — sales reads it during Discovery, not only once the quote is formally sent. **Duplicate-proof**: refuses a quote that already has `deal_id`, and claims the row with a compare-and-set (`zoho.creating_at`, 2-min TTL) before calling Zoho — there is no DELETE scope, so a duplicate deal is a manual cleanup. Needs `ZohoCRM.modules.deals.CREATE`, so it 401s until someone does Disconnect → Connect with the wider scopes |
| **Estimate → Deal content** | `lib/zoho/deal-estimate-sync.ts` | Both "Create deal" and "Push to Zoho" put the estimate's **Packages rows** (one per `zoho.products` entry: Product lookup + Unit Price = its `splitAmount` share of the estimate's amount) onto the Deal, plus the Description on push. **The row's Description column carries the product's own catalogue description**, read live from the Products module — that is what someone opening the deal wants to read; the "N h" note is only the fallback for a catalogue entry that has none. It is shown in the send dialog under each product, so the review matches what is written. Both the picker and the row bound it with `truncateAtWord` (`lib/zoho/products.ts`) rather than a hard `slice`: a sentence cut mid-word ("…server-side scripting lang") reads as corrupted data in a CRM field, not as an excerpt. **A quote with no products still carries its price**: `estimateTotalRow` writes ONE row with `Unit_Price` = the whole estimate and no Product lookup (`Product` is `required: false` on this subform, verified live) — and that price only reaches Zoho this way, because `Amount` is recomputed from these rows. **Nothing is hardcoded**: the subform and its columns are resolved from live field metadata by LABEL and type (`findPackagesSubform`), because custom API names can't be guessed — this org's "CATEGORY" field is reachable only as `CATEGORY1`. **Verifies the replace**: after a replacing write it re-reads the row count and warns if it differs from what was sent — a subform PUT is documented to replace, and if it ever appended the deal would silently show double the estimate while the call still reported success. **Overwrites only when asked**: the deal is read first, and by default any existing rows/description are left alone with a warning, since a subform write replaces every row and sales may have typed their own. That default made the price **write-once** — `Amount` is derived from the rows, so an edited estimate could never reprice a deal that already had any — which is why the send dialog (and only the send dialog) passes **`replace=1`**, after showing the deal's live amount and row count. Import, the status changer and mark-complete keep the safe default. The free-text `Description` is narrower still: `replace` rewrites it only when this app wrote it (`isGeneratedDescription`, matching the `Estimate: … line item…` roll-up) — a rep's own notes are never deleted. Can't resolve the subform → skips, warns, and the products still ride in the Description |
| **Stage picklist** | `/api/zoho/deal-stages` | The org's own Deal `Stage` list (value + pipeline order + forecast bucket + probability), read via `ZohoCRM.settings.READ` and cached 30 min in `lib/zoho/stages.ts`. **One reader, deliberately**: the status changer offers exactly what the push route accepts, so the menu can never show a stage the server then rejects. The readable bucket is **`forecast_type`** ("Open" / "Closed Won" / "Closed Lost"). `forecast_category` looks right and is **an opaque id** — matching on it classifies every stage as not-won |
| **In-app status changer** (write) | via the push route | The stage badge on the editor's Setup panel is a dropdown (`ZohoStageSelect`): pick any stage in the org pipeline and the deal moves, without opening Zoho. **All stages, revenue ones included** — a stage is reversible in Zoho, and the irreversible half (the PO) has its own gate. No confirm dialog; the result is toasted |
| **Stage board** (write) | via the push route | Estimator → **Stages**: the same estimates as the list, arranged as a Zoho-shaped pipeline (`ProposalStageBoard`) so someone who works the deal in the CRM recognises the layout. Columns are the org's own picklist in Zoho's order with its probabilities, headed by that column's estimate total and count. Dragging a card moves the real deal. **Only this app's estimates appear** — the rest of that pipeline is sales' business, and rendering it would imply this app could act on it. See the rules below |
| **Push to Zoho** (write) | `POST /api/zoho/deals/[id]/push` | The app's only writes: **two explicit buttons plus one on import**. **Import / link a deal** → **"Discovery"**, no attachment. **Quote editor → "Send to Zoho"**: also **"Discovery"** — a finished estimate means scoping is done, and sales walks the deal up the pipeline from there. The PDF is attached and the Packages rows filled either way. **Project page → "Mark complete in Zoho"** (only once the project is `completed`): Deal → **"Project Completed"**, no attachment. Gated by `requireZohoWriter()`. **Any stage in the org picklist is settable** (the status changer above); the guard is that it must EXIST — validated against `lib/zoho/stages.ts` before the request leaves the process, not a hardcoded list. **`Stage` is the only plain field written** — `Quote_number` is a system *autonumber*, and `Amount` **reports itself writable but is not**: a write returns SUCCESS, reads back correctly, then Zoho recomputes it from the **Packages subform** within seconds (verified live — 43,833 reverted to the subform's 20,000 in under 4 s). So the estimate's price travels as a priced Packages row, never as an `Amount` write. **Idempotent against the LIVE deal**: the route reads the deal's current stage before writing and skips the PUT when it is already there (`stageAlreadySet`). That replaced replaying the quote's own `pushes` history, which blocked two legitimate things — a status changer moving A→B→A, and re-attaching an edited estimate's PDF to a deal already at Proposal Sent. **Forward-only for side-effect stages**: a push carries `explicit=1` only when a human picked the stage from the in-app status changer — that may move a deal anywhere, backwards included. Everything else is a side effect and may only move a deal FORWARD, judged by the org's own `sequence_number` (`stageOrder`), not a static list. This matters most for "Send to Zoho", which sets *Discovery*: on a deal sales had already moved to Negotiation or Closed Won, that would silently drag it back to the start of the pipeline in order to re-attach a PDF. Only the **stage** is held back — the PDF and Packages rows still go up, because losing those would be the worse bug. `AUTO_ADVANCE_FROM` additionally pins the import's Discovery advance to `Proposal Requested`. `proposals.zoho.pushes` (`stage → timestamp`) is still recorded — the sibling guard and the badge read it — but no longer gates a re-push. **Attachments are deduped separately, by filename** (`proposals.zoho.attachments`, `filename → timestamp`, via `shouldAttach()`): the PDF now goes up at whichever stage a deal is opened at, so "was this stage pushed?" is no longer the right question. `proposalPdfFilename` embeds the estimate's date, so re-sending an unchanged quote is skipped while an estimate edited later attaches its updated PDF. This matters because Zoho does **not** dedupe (same filename twice = two records) and there is no DELETE scope. Read it via `zohoPushes()`, which folds in the legacy `pushed_at`/`pushed_stage` fields. Every push (and every skip) records the live `stage` + `stage_synced_at`, which is what `ZohoStageBadge` renders on the Estimator list and the editor's Setup panel |

> **One settle rule, shared** (`lib/zoho/stage-catalog.ts`). The picklist
> cache and `moveDealStage` were lifted out of `ZohoStageSelect` when the board
> arrived: two surfaces that move deals must not each carry their own copy.
> `moveDealStage` returns where the deal **settled**, which is not always what
> was asked for — a push can be held back, and the route then reports
> `currentStage`. Persisting the request instead is how the badge started lying
> once before, because the store's write-through overwrote the value the route
> had just recorded correctly.
>
> Three more rules the board depends on:
>
>  - **Optimism is board-local.** A dragged card moves instantly via a `pending`
>    map, but nothing reaches Postgres until the server answers — then the
>    SETTLED stage is written. A failure clears `pending` and the card snaps
>    back. Writing optimistically here would persist a stage Zoho refused.
>  - **Nothing is ever hidden.** A quote whose stage is not in the picklist
>    (renamed in Zoho, imported before a change) gets its own column at the end.
>    An estimate that silently disappears from the board is the worst outcome.
>    Estimates with no `deal_id` sit in a **"Not in Zoho"** column that is not a
>    drop target — there is no deal to move.
>  - **It has to look like a pipeline, and fit the screen.** The strip has a
>    FIXED height, `h-[clamp(26rem,calc(100dvh-14rem),52rem)]`, and each column's
>    card list scrolls on its own (`min-h-0 flex-1 overflow-y-auto` — without
>    `min-h-0` the list grows the column instead). It used to be a `min-h`, so
>    the tallest column set the page height and a busy Closed Won pushed every
>    header off screen; `stage-board.spec.ts` now stuffs a column and asserts the
>    page does not grow. Its scrollbar is deliberately made visible — overlay scrollbars fade
>    when idle and the last column is cut mid-card at most widths, so without it
>    the board reads as a board that simply ends. A line under it names the
>    stage count and both ways to move a card. Loading shows **skeleton
>    columns**, not a sentence: the picklist is a live Zoho settings read on the
>    first hit of the 30-minute cache, and one centred line where a whole board
>    is about to appear reads as a broken page.
>  - **It is shaped like Zoho's board on purpose.** A column carries a rule
>    coloured by its **forecast bucket** (`accentFor` — won green, lost muted
>    red, open blue) rather than by stage name: names differ per org, the three
>    buckets do not, and that colour is what makes the CRM's board readable at a
>    glance. A card reads deal → account → contact → amount → **closing date**,
>    the five things someone scanning that pipeline is looking for, taken from
>    `proposals.zoho` where the CRM has them. A closing date that has passed
>    turns red via the shared `isOverdue` — never `new Date(iso) < now`, which
>    on a DATE string is UTC midnight and flags a day early west of Greenwich.
>    The clock is read **once** into state (`Date.now()` in a render body is an
>    impure call the React Compiler rejects, and per-card readings could
>    straddle midnight and disagree). The per-card stage menu is
>    `ZohoStageSelect compact` — an icon, because the column already states the
>    stage and a badge on every card would repeat it N times.
>  - **Drag is a pointer gesture; the card's stage menu is the universal one.**
>    At 375px a single 17rem column fills the viewport, so no second column is
>    ever on screen to drop onto — verified, and why the drag tests skip at
>    mobile. Every card therefore carries `ZohoStageSelect`, which is also the
>    only path available to a keyboard. Collision detection is `pointerWithin`
>    rather than the task board's `closestCorners`: nothing here is sortable, and
>    the column the cursor is inside is the one `isOver` highlights, so the drop
>    matches what the user is looking at.

> **This org's pipeline order is not the obvious one.** Read live:
> Discovery (1, 25%) · Negotiation (2, 35%) · Proposal Requested (3, 45%) ·
> Proposal Sent (4, 50%) · Verbal Yes (5, 60%) · Proposal Signed (6, 90%) ·
> Closed Won (7, 100%) · Closed Lost (8, 0%) · Not at this time maybe later
> (9, 20%) · Project Completed (10, 0%). So the import's "Proposal Requested →
> Discovery" advance moves a deal *backwards* by Zoho's own ordering — it is
> deliberate (scoping starts there), which is why `AUTO_ADVANCE_FROM` encodes
> intent rather than being derived from `sequence_number`.

> Use **Accounts + Contacts** (~4.0k / ~3.7k qualified records) for client data — **not Leads**
> (~122k raw, full of test/spam rows). A Lead converts into Account + Contact (+ Deal).

> **One active estimate per deal** (`lib/zoho/deal-exclusivity.ts`). Two quotes
> sharing a `deal_id` breaks quietly: the push guard reads *that quote's* own
> `pushes`, so the second one pushes as if it were the first — the stage moves
> again, a **second PDF is attached** (Zoho doesn't dedupe), and the Packages
> write is skipped because rows exist, leaving one estimate's pricing beside
> another's PDF. Enforced in three places: import/link is blocked in the UI, the
> push route asks whether **any** quote on that deal already pushed the stage,
> and PO creation refuses if a sibling on the same deal is already billed.
> *Active* excludes `rejected`, so replacing a dead estimate is still allowed —
> but a rejected quote that already pushed still blocks a re-push, since
> rejecting it doesn't remove the PDF from the deal.

**The CRM link** lives in **`proposals.zoho`** jsonb (migration `0029`):
`{deal_id?, deal_name?, account_id?, account?, contact_id?, contact?, contact_email?, contact_phone?, owner?, closing_date?, amount?, currency?, quote_number?, stage?, stage_synced_at?, web_url?, imported_at}`.
Every field is optional except `imported_at` — a quote may come from a deal, from an account, or both.

> **`proposals` has no realtime channel, on purpose.** The row is one JSONB
> document, so an echoed upsert would replace `line_items` / `addons` /
> `discovery` wholesale — under someone mid-edit. Two consequences to respect:
> the estimator refreshes by re-reading (`hydrateFromSupabase`), and the one
> field worth mirroring by hand is the project link. `proposals.project_id` is
> `on delete set null`, so Postgres clears it when a project goes; the projects
> DELETE handler in `workspace-sync.tsx` calls
> `applyProjectDeleted(id)` to mirror that locally. UI never trusts the raw id
> either — the editor resolves it against the live projects store, so a dangling
> link shows **Start project** rather than a **View project** button pointing at
> a page that no longer exists.

> **Narrow saves.** `persistQuoteDoc(id, get, columns)` writes
> `updated_at` plus ONLY the listed columns (`QuoteColumn` = a key of
> `quoteUpdatePayload()`, so a typo is a type error). It used to send every
> column, so editing a line item rewrote `zoho`, `pbs` and `project_id` from this
> tab's copy — and a PO number or deal link written a moment earlier by the
> server route, the poll or another tab was silently reverted. Three audit
> passes flagged it independently. A new action passes the columns it changes.

> **Adding any column to `proposals` means updating three places** — `quoteUpdatePayload()`,
> the `Pick<ClientQuote, …>` param type of `updateProposal`, and `rowToQuote`. Miss either of the
> first two and the edit updates the store but **silently never persists**; miss `rowToQuote` and it
> persists but never comes back on hydrate.

**Env** (server-only, never `NEXT_PUBLIC_`): `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, optional
`ZOHO_REDIRECT_URI` / `ZOHO_ACCOUNTS_DOMAIN` / `ZOHO_SCOPES`. The redirect URI must match the Zoho
API Console entry **exactly**. Zoho quirks worth knowing: search `criteria` supports only
`equals`/`starts_with` (use `word=` for free text), record counts need **v2.1+**, the callback must
use the `accounts-server` query param (data-center aware), and bulk export needs `ZohoCRM.bulk.READ`.

---

## PBS Billing Integration (create a PO from an estimate)

**What it is.** A second external system: PBS (`https://pbsserver.com/api`) is the
billing app. When an estimate is sent to Zoho, it can also open a **purchase
order** there. Full design + live API findings: [docs/pbs-integration-plan.md](docs/pbs-integration-plan.md).

**Auth.** Machine-to-machine, no consent screen. `PBS_APP_ID` / `PBS_APP_SECRET`
(server-only) mint a 1-hour access token, cached in `pbs_connection` (migration
`0030`, RLS enabled with **no policies** — service-role only, like
`zoho_connection`). **`/refresh` is never called**: rotation kills the old token
instantly with no reuse window, while minting is unconditional and non-revoking,
so an expiring token is simply re-minted. The table is a cache, not a source of
truth.

> **Minting is NOT safe to race.** PBS keeps
> a unique index on `(app_id, refresh_token_hash)`, so two `/token` calls landing
> together get a raw driver error back:
> `SQLSTATE[23000] … columns app_id, refresh_token_hash are not unique`.
> It surfaced the moment the PO status read started fanning out five requests at
> a time against a cold cache — each found no fresh token and minted. Every
> caller now goes through **`mintOnce`** (`lib/pbs/tokens.ts`): one in-flight
> promise shared per process, plus a re-read of the cache on failure to cover the
> cross-process case, where another instance has just minted a perfectly good
> token. Reproduced and re-verified live by forcing `expires_at` into the past
> and firing two concurrent batched requests.

> Three things the PBS reference doc gets wrong, all verified live:
> the base path is **`/api`**, not `/pbs/api` (which answers **HTTP 200** with an
> HTML login redirect); **`Authorization: Bearer` is rejected**; and the reads
> accept POST — so every call sends credentials in the **JSON body**, keeping
> tokens out of URLs and logs. Success is the parsed `status` field, **never** the
> HTTP status.

| Feature | Route | What it does |
| ------- | ----- | ------------ |
| **Health** | `/api/pbs/health` | Admin-only, read-only. Token + reads + the derived client list |
| **Clients** | `/api/pbs/clients` | The billing clients, **derived from PO history** — PBS has no clients endpoint (nine paths probed, all 404). A PO number's first 3 letters are the client's code |
| **Candidate PO preview** | `GET /api/pbs/pos?proposalId=&clientId=` | Read-only. A PO can outlive its link (created in PBS *first*, recorded *second*), so before creating, the dialog asks whether PBS already holds one. Matched by `pickPoCandidate` on the estimate's **title within one client**; writes nothing |
| **PO status refresh** (PBS → app) | `GET /api/pbs/pos?proposalIds=…` | The PBS→app direction, `usePbsPoRefresh`. Reads each linked PO with `fetchPoById` (`fetch-po` + `po_id`) and stores `status` / `missing` only when they changed. **Exact, so it applies automatically** — the id was recorded at creation, unlike the name-matching that keeps *linking* manual. Live history uses five status codes (B 440, C 27, N 19, A 8, E 6 of 500), so a PO does move after this app creates it. `fetch-po` **without** `po_id` answers HTTP 200 with 200 arbitrary POs (verified live) — same shape as a success; a not-found is an explicit `400 / "PO not found."`, which is why "gone" and "couldn't read" stay distinct. Only status code **N = New** is confirmed (from the PBS UI); the rest render as their raw letter rather than a guessed label |
| **Create PO** (write) | `POST /api/pbs/pos` | The only PBS write. Sends `name` + `client_id` + `project_template_id` + `start_date`/`end_date`; PBS generates the PO number. **Gated on the deal being won** — see below. **Refuses (409) when a candidate exists**, handing it back for a human to confirm; `linkExisting=<po_no>` then records the link and calls PBS not at all. A PBS read it can't complete returns 502 rather than proceeding — the quote's own `pbs` field is not proof a PO doesn't exist |

**Endpoint allowlist.** `lib/pbs/endpoints.ts` is deny-by-default —
`pbsFetch` refuses anything unlisted. `register` (creates an app permanently),
`refresh` and `token` are deliberately unreachable through it.

**Project templates are per client.** Across 500 POs and nine templates, **no
template is used by two clients**, so a global default would file POs under
another client's template. Each PO uses its client's own most-used template
(`lib/pbs/directory.ts`); a client with no PO history is **refused** rather than
given someone else's. `PBS_PROJECT_TEMPLATE_ID` overrides this and is optional.

**Sync is one-and-a-half directions, and that is deliberate.** App → PBS is
*create only* (there is no update endpoint). PBS → app refreshes each linked
PO's **status** on open, keyed on `po_id`. What is NOT synced back: the
estimate's own figures, because a PO carries none (see below).

**The PO is a shell** — name, client, template, and a project date range. The
API accepts nothing else: `rate_per_hour` is pinned to `0.0000` server-side and
there is no line-item or amount field, so the estimate's figures stay in this
app and in Zoho.

**Project dates** (`start_date` / `end_date`, `YYYY-MM-DD`) were added to
`create-po` in the Sep 2026 API update (`pbs-docs/`). PBS stores them in a
separate `po_parameter` record written in the **same transaction** as the PO, and
nothing this app may call reads or edits it — `fetch-po` returns the PO row
alone. Three consequences:

- **Both are optional to PBS and default to the current UTC date**, so
  omitting them files a months-long project as starting *and ending today*. The
  Create PO dialog therefore always sends them.
- They are pre-filled from **`estimateDateRange`** (`lib/discovery/from-line-items.ts`)
  — the same analyzer the Gantt draws, so the PO matches the timeline on screen
  rather than a second derivation. The start rule itself is one function,
  `resolveProjectStart` (`lib/discovery/timeline.ts`): `DiscoveryGantt` had a
  byte-identical private copy, which is item 8 waiting to happen — the two
  consumers being the timeline someone *looks at* and the range they are
  *billed against*. `DiscoveryTimeline`'s own dates are formatted
  `"MMM d, yyyy"` for display and no API accepts them; this returns ISO. It
  returns `null` when the quote has no line items, and the dialog says so
  instead of inventing a range.
- They are **editable** in the dialog (the billed schedule is the coordinator's
  call), and validated both there and in the route — before the row claim, so a
  rejected range leaves no dangling `creating_at` lock. The route round-trips
  each value rather than trusting `Date.parse`, which **rolls over**:
  `2026-02-31` parses happily as March 3rd and `2026-04-31` as May 1st (verified),
  so a typo would become a different, permanent date in a record with no edit
  endpoint. `end_date` must be on or after `start_date`. The range sent is
  mirrored onto `proposals.pbs` — the app's only record of it — and shown in the
  PO badge's tooltip on both the editor header and the Estimator list.
- **Create only.** `linkExisting` records a PO whose range PBS already holds and
  this app cannot change, so the dialog hides the fields, stops gating the
  button on them, and sends no dates at all on that path.
- The end date is `start + totalBusinessDays`, the **max across phases**, so it
  covers the launch phase and anything (e.g. SEO) that outruns it. Verified live
  against the estimate on screen: PO `2026-09-04 → 2026-12-10` beside the Gantt's
  "69 business days · launches Dec 10, 2026".

> **The pre-fill effect must depend on the derived STRINGS, not the object.**
> `estimateDateRange` returns a fresh object per call, so an effect keyed on it
> re-ran whenever the quote's identity changed — and picking the billing client
> writes `pbs` through the store, which does exactly that. The dialog then
> **silently reset dates the coordinator had typed** (`2027-03-01` → today) and
> filed the PO with the derived range, with nothing on screen saying so. The
> `useMemo` is likewise keyed on the four fields the derivation reads
> (`discovery`, `line_items`, `addons`, `requirements_unclear`), never on
> `quote`. Regression test: `e2e/po-date-edits.spec.ts`.

> **PBS has no delete endpoint.** A duplicate PO is a manual cleanup in a live
> billing system, so `POST /api/pbs/pos` refuses a quote that already has a
> `po_no`, claims the row with a compare-and-set (`pbs.creating_at`, 2-min TTL)
> before calling PBS, releases the claim on failure, and retries the link write
> once. **Adding a column to `proposals` means updating three places** —
> `quoteUpdatePayload()`, the `Pick<ClientQuote, …>` on `updateProposal`, and `rowToQuote`.

**Default billing client:** `PBS_DEFAULT_CLIENT` (a three-letter **code**, default
`STR`) is used when an estimate has no client of its own. It's resolved against
live PO history, so an unknown code leaves the picker empty rather than failing at
create time. Precedence: the estimate's own client → the workspace default. It is
**not written to the quote** until a PO is actually created, so changing the env
changes future estimates without rewriting past ones.

**Storage:** `proposals.pbs` jsonb (migration `0031`) —
`{client_id, client_code, po_id, po_no, created_at, creating_at, adopted, status,
status_synced_at, missing, start_date, end_date}`.

> **A PO is never linked on a name match alone.** PBS has no get-by-name, so
> the only thing to match on is the `name` this app set at create time — and a
> name is not an identifier. Two estimates can share a title ("Website
> Redesign") for different clients, and a repeat client can have the same job
> name twice a year, so name **and** client can still point at last year's PO.
> `pickPoCandidate` (`lib/pbs/clients.ts` — pure, so the decision is testable)
> requires the client match and reports `matchCount`, but it returns a
> **candidate**: the Create PO dialog shows the number, its date and its
> `create_by`, and linking is a separate explicit click (`linkExisting`).
> Deliberately asymmetric — a duplicate PO is a visible mess someone cleans up,
> while billing work against the wrong PO is silent and nobody notices.
>
> **`rowToQuote` must map every jsonb column, and `pbs` was missing.** It was
> written to Postgres and dropped on every hydrate, so a reload forgot the PO:
> the number vanished from the UI *and* `canRaisePo` (gated on `po_no`) offered
> **Create PO** again on an already-billed estimate — into a system with no
> delete endpoint. Adding a jsonb column to `proposals` therefore means **three**
> places, not two: `quoteUpdatePayload()`, the `Pick<ClientQuote, …>` on
> `updateProposal`, **and `rowToQuote`**. Miss the first two and the edit never
> persists; miss the third and it persists but never comes back. The billing
client is chosen in the **Create PO** dialog — the one place it is acted on, so
Setup and the send dialog carry no PBS controls at all. When an earlier estimate
for the same Zoho account already has one, the picker offers it in one click (no
mapping table — the loaded quotes carry the answer).

**Billing waits for the win.** A PO is no longer part of "Send to Zoho" — sending
a quote is not winning the work, and PBS cannot delete a PO. Instead:

1. Sales (or the coordinator, via the in-app status changer) moves the deal to
   **Closed Won** in Zoho.
2. The app hears about it by **polling**, not webhooks: `useZohoStageRefresh`
   already re-reads linked deals when the Estimator list or an estimate opens.
   On the *transition* into a won stage it raises a bell notification to admins +
   managers and logs a workspace activity entry, so the button that just appeared
   is not a surprise. The notification uses `notify(..., { includeSelf: true })`:
   nobody here *did* anything — sales moved the deal and this session merely
   noticed — so the usual "don't notify the actor" rule would leave a lone admin
   with no notification at all. Detection is per-browser, so two admins with the
   app open each raise one.
3. Reaching a won stage also promotes the estimate from `draft`/`sent` to **`approved`** — winning the deal *is* the approval, so **Start project** appears beside **Create PO** instead of waiting for someone to flip a dropdown. A `rejected` estimate is left alone; that was a deliberate call about the quote.

   > **Stage and promotion travel in ONE store write** (`applyDealStage`).
   > Doing it as `updateProposal` + `setProposalStatus` is a race, not a
   > sequence: `persistQuoteDoc` used to send the **whole document**, `status`
   > included, so the stage write — built while the quote was still `draft` —
   > could land after the status write and revert `approved` back to `draft`.
   > It now sends only the columns the action changed (see "Narrow saves"
   > under the Zoho section), and `applyDealStage` re-reads `zoho` from the
   > database before merging the stage into it.
   > Reproduced at roughly **one in three**, on both the in-app path and the
   > poll. Anything that changes two fields of a quote at once must go through a
   > single action for the same reason.
   >
   > **However the deal got there.** That promotion lived inline in
   > `useZohoStageRefresh`, so only the **poll** ran it: moving a deal to Closed
   > Won from the status changer — or, once it shipped, by dragging a card on the
   > stage board — wrote the stage and nothing else, leaving the estimate `draft`
   > with no **Start project**. The rule lives in **`lib/zoho/won-transition.ts`**:
   > `applyWonTransition` (promote + activity + notify, guarded on the
   > *transition*) and `recordStageChange` (record the settled stage, then apply
   > it) — the poll calls the first, both in-app surfaces call the second, so the
   > three cannot drift again. `observed` only changes the wording and whether
   > the actor is notified; the promotion is identical. Regression test in
   > `e2e/stage-board.spec.ts`, including that a **rejected** estimate stays
   > rejected while its stage still moves.
4. **Create PO** appears in two places — the estimate's header (visible from
   every tab) and its card on the Estimator list, so the next step is offered
   without opening anything. Both open the same `CreatePoDialog`: client,
   template, PO name, and the warning that it cannot be undone.

**"Won" is Zoho's forecast bucket, not a name** (`stageIsWon` in
`lib/zoho/push-state.ts`, client-safe so the button and the server gate cannot
disagree; checked in `e2e/won-stage.spec.ts`). **Closed Won** and **Project
Completed** both qualify — a deal that jumped straight to Completed can never go
back, so name-matching only "Closed Won" would strand its PO forever. There is no
"Deal Won" stage in this org; the won stage is **Closed Won** (probability 100).

The server gate is the real one: `POST /api/pbs/pos` re-reads the deal's stage
**live** (not the cached `zoho.stage`) and **fails closed** — a Zoho read it
can't complete returns 502 rather than creating a PO. **An estimate with no
Zoho deal is refused (409)** — decided 2026-10-12: with nothing that can be won
there is no gate, and PBS can't delete a PO, so "billable by default" was the
wrong way round. `canRaisePo` requires `zoho.deal_id` too, so the button never
offers what the route refuses. Send the estimate to Zoho first. The Create PO dialog picks *where* it is filed, so the
choice and the act sit together.

---

## Realtime — the timeline, and every page that feeds it

**Three channels, wired in `components/layouts/workspace-sync.tsx`:**

| Channel | Tables | What it keeps live |
| --- | --- | --- |
| `workspace:board` | `projects` `sprints` `tasks` `task_assignees` `task_comments` `comment_reactions` | the Gantt, the task boards, the drawer |
| `workspace:scheduling` (`0037`) | `availability_entries` `weekly_capacity` `profiles` `hourly_rates` (`0042`) | what *shapes* the timeline and the price — PTO, capacity, roster, rates |
| `notifications:<uid>` / `activity:workspace` | `notifications` `activity` | the bell and the feeds |

All 12 are published to `supabase_realtime` and all 12 are subscribed — verified
live against `pg_publication_tables`. `proposals` is the one deliberate
omission (see the JSONB note under the Zoho section).

> **`postgres_changes` bindings are RLS-checked SERVER-SIDE AT JOIN TIME**,
> against the token the **socket** carries — not the one REST calls use. Join
> before the session has resolved and the bindings register as `anon`, match
> nothing, and **stay dead for the life of the channel**. Handing the socket a
> token afterwards does not re-evaluate them.
>
> This is why every channel is now created by **`liveChannels()`**, which
> `await`s `supabase.realtime.setAuth()` *before* calling `.subscribe()`. With
> `@supabase/ssr` the session comes from cookies, so it resolves a tick after
> mount — it was a **race**, which is the whole explanation for "realtime worked
> this morning and not this afternoon".
>
> **It fails completely silently.** The channel reports `SUBSCRIBED`, the
> socket's token reads `authenticated` a moment later, Broadcast keeps working
> (no RLS on it), and the replication slots stay active and fully caught up.
> Nothing anywhere looks wrong — the handlers simply never fire. Proof, measured
> in the browser: a channel created *after* page load receives INSERT and UPDATE
> on the **very same socket** where `workspace:board` receives nothing.
>
> **`setAuth()` takes NO ARGUMENT, deliberately.** An explicit token is
> marked manually-set, which permanently disables supabase-js's own refresh
> (`RealtimeClient._performAuth`) — the socket would keep a token that expires
> in an hour and every channel would go quiet mid-session. With no argument it
> resolves the current session and refreshes itself on each heartbeat.

> **On DELETE, `payload.old` carries ONLY the primary key** (that is what
> `REPLICA IDENTITY DEFAULT` puts in the WAL). So an applier that reads any
> non-PK column from `old` silently no-ops. Audited — every table's PK is
> exactly what its handler reads: `weekly_capacity` is keyed on `profile_id`,
> `task_assignees` on `(task_id, profile_id)`, `comment_reactions` on
> `(comment_id, profile_id, emoji)`, and the rest on `id`. **That is also why
> `0038` was never needed.** Adding a table here means checking this first: a
> surrogate `id` PK on a join table would break DELETE propagation while INSERT
> and UPDATE kept working.

**Two wrong theories, recorded so nobody re-runs them.** `0038` set
`REPLICA IDENTITY FULL` on ten tables on the theory that UPDATEs were dropped
for want of a full old tuple; it made things worse and `0039` reverted it.
`0040` refreshed the publication; no effect. **Both premises were false** — with
plain `REPLICA IDENTITY DEFAULT` a socket carrying a user JWT receives INSERT
*and* UPDATE, proven from Node against the live project. The net of `0038`–`0040`
is zero; only `0037` (publishing the scheduling tables) mattered.

**Known bounded gap:** the hydrate effect and the channel join both start at
mount, so a row written by someone else in that ~300 ms window is neither in the
snapshot nor streamed. Fixing it means re-hydrating after `SUBSCRIBED`, i.e. a
second full fetch on every mount, for a window narrower than the request that
would close it. Left alone on purpose. `e2e/helpers.ts`'s **`settleRealtime()`**
exists for the same reason: `postgres_changes` has no backfill, so a test that
writes the instant the page is interactive is racing the subscription rather
than testing it.

---

## Security — what a signed-in user can do without the UI

**The UI is not a security boundary.** The anon key is public, so any signed-in
user — a viewer included — can call PostgREST directly and skip every button
`usePermissions()` hides. RLS and triggers are the only real gates.
**`scripts/security-probe.mjs`** drives the database the way an attacker would:
it creates a throwaway `[E2E]` **member**, attempts each abuse with that
member's real JWT, reads every result back with the service key, and deletes
everything it made. Every line must read `PASS`. Run it after touching any
policy, trigger or constraint.

Fixed in **`0041`**, each reproduced live first:

| Abuse | Before | Now |
| --- | --- | --- |
| Extend an **approved** leave by changing only its dates | stayed approved — 2 days became 12, capacity shrank, nobody asked | re-opens as pending |
| Edit your own decided leave the way the client does (send `pending`) | **refused** — `0035` raised on any status change by a non-approver, so members could never edit their own approved/rejected leave | allowed; re-pends |
| Insert a request with `reviewed_by` = a manager + "Approved by the boss" | stored | verdict fields nulled for a non-approver |
| Null your own `confirmed_at` | dropped you off the roster, the team calendar and every capacity figure | refused (also `email`) |
| External link in someone's bell / the workspace feed | `https://evil…`, `//evil…`, `/\evil…` all stored | `CHECK` constraints: internal paths only |

> **Probe pitfalls that produced false PASSes, recorded so they are not
> repeated.** (1) `Prefer: return=representation` makes PostgREST run
> `INSERT … RETURNING`, and the new row must then pass the **SELECT** policy —
> a notification to someone else is invisible to its sender, so the insert is
> reported as an RLS violation and every href probe "passes". Insert with
> `return=minimal` and read back with the service key. (2) **The service key
> cannot approve leave**: `0035` fails closed on a caller with no profile role,
> so a service-role insert of `status='approved'` is silently forced to
> `pending` — the first run tested a pending leave and "passed". Approval
> fixtures use the manager bot's JWT and throw if the row does not reach
> `approved`.

**Hourly rates (`0042`)** are covered by probes P10–P13: a member reads 0 rows
and cannot insert or update; a manager reads every row but cannot write; an
admin can write, proven on a throwaway `[E2E] probe` row so the real rates are
never touched.

**Work keys (`0043`)** are covered by P14–P16: a member cannot give themselves
a key (the guard raises), a manager cannot set anyone's (RLS: a manager updates
only their own profile), and an admin can — while a malformed key (`IT|Level 9`)
is refused by the column's CHECK. P16 is also the positive control for P14: the
same body the member was refused is accepted from an admin.

**Fixed in `0046`** (the 2026-10-09 audit), each reproduced live by its probe
first — P1b, P18, P19 and P20 all failed against the old schema:

| Abuse | Before | Now |
| --- | --- | --- |
| Edit your own time entry — hours, task, `logged_at` — or delete it (P1b) | allowed: 0017 only pinned `profile_id`, and **P1 passed for the wrong reason** by changing `profile_id` in the same request | UPDATE/DELETE admin-only; the app only ever inserts |
| Put a colleague on a task as **accepted** (P18) | stored — their workload grew and hours could be logged on it without them ever agreeing | `guard_task_assignment` forces someone else's row to `pending` (self-assign stays accepted, by design) |
| Re-point your own assignment at another task, or store `rejected` (P19) | allowed | `task_id` / `profile_id` / `assigned_by` are pinned; the only status a member may set is `accepted` |
| Keep working after deactivation (P20) | an issued token lives up to an hour, and `current_user_role()` ignored `deactivated_at` | `current_user_role()` is NULL for a deactivated profile |

> **NULL role is not "trusted".** With deactivated people now role-less,
> `prevent_role_self_change` could no longer identify the system writer as
> "no role" — a deactivated session would have passed as trusted and could
> reactivate itself. It now trusts only `auth.uid() is null` (no JWT at all);
> P21 checks the deactivated member still can't. `0046` also adds partial unique
> indexes: one estimate per `project_id`, per `pbs->>'po_no'`, and per **active**
> `zoho->>'deal_id'` — the UI already refused each, and now the database does.

**Fixed in `0048`**, each reproduced live by its probe first (P22–P26 all
failed against the old schema):

| Abuse | Before | Now |
| --- | --- | --- |
| Set a task's logged total to any number (P22) | an accepted assignee could PATCH `logged_hours` = 999 | derived from `time_entries` by trigger; any direct write by a signed-in user is refused |
| Delete a task and its worked hours with it (P23) | `time_entries` cascaded away | entries survive, `task_id` NULL |
| Back-date or pre-read a notification / activity row (P24) | `created_at` and `read` came from the client | `stamp_feed_row` sets `created_at = now()`, `read = false` |
| Empty or essay-length bell/feed text (P25) | anything stored | CHECK 1–500 chars (longest live text was 120) |
| Keep posting after deactivation (P26) | allowed for the life of the token | insert policies require an active role |

> **What a member can still write:** the wording of a notification or feed
> line they send. That is attributable — `actor_id` is pinned to the sender
> (`0027`) and both the bell and the feed render the sender's own name and
> avatar from it, not from the text — so a forged line reads as *that member*
> saying it. Moving the wording server-side (a route that builds text from an
> event type) is the full fix if that ever stops being enough.

**Verified safe, no change needed:** all 18 API routes are guarded
(`requireAdmin` / `requireZohoReader|Writer` / `requirePbsReader|Writer`), every
guard verifies via `auth.getUser()` and reads the role from `profiles` — never
from `user_metadata`, which the user can write — and offboarding bans the auth
user, so a deactivated account fails `getUser()`. Members cannot make themselves
admin. The one redirect parameter, `/auth/confirm`'s `next`, goes through
`safeNext` — an in-app path only (`/x`; never `//x`, `/\x` or a scheme). Headers: `frame-ancestors 'none'` + `X-Frame-Options: DENY`,
`nosniff`, strict referrer policy, HSTS, and a report-only CSP being staged.
Comment HTML goes through DOMPurify.

---

## Dashboard (Mine / Team)

**Two scopes behind the shared `MineTeamToggle`** — admin/manager get both,
Member and Viewer get their own only. Same gate and same control as Workload and
the Calendar: `components/common/mine-team-toggle.tsx`, extracted when the
dashboard was about to become its **third** byte-identical copy. It renders
nothing when the viewer has one scope, because a toggle with one reachable
option is a control that lies.

| View | Component | Shows |
| --- | --- | --- |
| Mine | `app/(dashboard)/dashboard/page.tsx` | KPIs, **My open work** (status donut + utilisation bar + logged/available), due-soon list, quick actions, activity |
| Team | `components/features/dashboard/DashboardTeam.tsx` | KPI strip, over-capacity banner, **open tasks per person** (stacked bar), workspace status mix (donut), **breakdown by person** table |

> **The dashboard derives NO numbers of its own.** Every figure on both views
> comes from `lib/workload/assigned-work.ts` — `assignedWork` / `capacityFor` /
> `utilization` / `statusBreakdown` — the same four calls Workload makes. This
> is the page people quote at each other, so it is the page that has to agree
> with everything else. `e2e/dashboard-views.spec.ts` asserts the overlap: every
> `N% of Mh` the dashboard prints must also appear on Workload.

**Charts are recharts via `components/ui/chart.tsx`** (shadcn). Colours are
**not** the chart library's palette — they come from `TASK_STATUS_META`, so a
bar segment is the same hue as the dot on the board, the calendar and the
workload bar.

> **`TASK_STATUS_META` keeps `dot` (Tailwind class) and `hex` on one line
> each, deliberately.** SVG cannot take a Tailwind class and a DOM node should
> not carry a raw hex, so the colour has to exist twice — and the two drifting
> is exactly how "blocked" ends up red on the board and purple in a chart.
> Adjacent means changing one without the other is a visible omission in review.
> `TASK_STATUS_LABEL` lives there too; the dashboard and Reports each had a
> private copy.

 - **Per-person counts a shared task for each assignee; the workspace figures
   count every open task once.** Those answer different questions — "how loaded
   is this person" vs "how much work is there" — and a 6h task with two
   assignees is 6h of work, not 12h.
 - **Workspace figures (Open tasks, status mix, Overdue) come from ALL open
   tasks, not from the union of per-person allocations.** The union version
   summed each person's overdue count — double-counting shared tasks — and left
   out **unassigned** work entirely, the overdue task nobody owns being the one
   a manager most needs to see. Both pages use `status !== "done" && isOverdue`,
   and `dashboard-views.spec.ts` asserts they print the same number.
 - **A KPI shows `—` until its data has loaded**, on the dashboard (both
   views) and Reports. The stores hydrate async and every figure otherwise
   reads a real-looking `0` first — for a moment the page asserted "0 overdue"
   as fact. Found because the cross-page test compared a number to a loading
   state.
 - Rows sort **busiest first**: the people a manager has to act on belong at the
   top, not whoever is alphabetically first.
 - **Chart axis labels are first names, disambiguated only when they collide.**
   Two people called Daniel drew two identical bars, so the one row a manager
   needed to act on was unidentifiable; a colliding name gains the surname
   initial ("Daniel A."), and everyone else keeps a bare first name because
   surnames on all six rows are just noise.
 - **Mine is a WIDE main column + a narrow sidebar** (`lg:grid-cols-[1.6fr_1fr]`)
   with **explicit placement**: due-soon table (col 1, row 1), Activity (col 1,
   row 2), and the sidebar — My open work + Quick actions — spanning both rows
   in col 2. The table needs the width; the sidebar cards are compact. With
   Activity in the sidebar the right side ran three cards deep beside one short
   table and the page leaned right. The DOM order (due soon → my work → quick
   actions → activity) is what a phone reads; the `lg:` placement only changes
   desktop. Adding a card means giving it a column and row, or it auto-places
   into a gap. `items-start` stops the short table stretching, and
   **`lg:grid-rows-[auto_1fr]`** is required: with plain auto rows, a tall
   sidebar (spanning both rows) spread its height over BOTH, opening a ~600px
   hole under the table. `dashboard-views.spec.ts` pins it.
 - The **due-soon list includes overdue work** (the most due thing there is), and
   its description says so. A missed milestone relabels its KPI tile
   **"Milestone overdue"** in red rather than "Next milestone · 37 days ago",
   which read as a bug.
 - The overdue/pending counts are `TaskBadgePopover`, so they open the task list
   behind them and link to each task's own board — the same control as Workload.
 - **Reports had the same bug until 2026-10-01** — its own `onTimeRate`
   still compared instants, so Reports and the dashboard could disagree about
   the same finished tasks. Both now call **`onTimePercent`**
   (`lib/workload/assigned-work.ts`) — one definition.
 - **Completion time is `tasks.completed_at`** (`0047`), stamped by a trigger
   when the status ENTERS done and cleared when it leaves; whatever the client
   sends is overwritten. It used to be `updated_at`, which moved on every later
   edit — a task finished on time turned "late" when someone renamed it weeks
   afterwards. Done tasks were backfilled from `updated_at`; a row without the
   column (0047 not applied) falls back to it.
 - **Fixed while building this:** `onTimeRate` compared
   `new Date(updated_at) <= new Date(due_date)`. `due_date` is a DATE column, so
   that is midnight **UTC** — a task finished at 15:00 local on its own due date
   counted as **late**, and west of Greenwich so did work finished the evening
   before. Exactly the trap rule 8 exists for, still live on this page. Now
   `daysUntil(due, completedAt) >= 0`, i.e. whole calendar days.
 - **`hooks/useWeekLoggedHours.ts`** is the one read of `time_entries` for
   "logged this week", shared by Workload (**both** tabs) and both dashboard
   views. It was an inline effect inside `WorkloadClient` **and a second private
   copy inside `WorkloadMine`** — which ran *alongside* the shared one, since
   `WorkloadClient` calls the hook before returning `<WorkloadMine/>`, so the
   Mine view fired two requests for one number. Never `tasks.logged_hours` —
   that is the task's cached total and credits every assignee in full.
 - **The hook returns `null` until the read resolves** (and always in demo
   mode), not `{}`. "Nobody logged anything this week" and "we don't know yet"
   are both `0` otherwise, and the personal card renders **—** plus full
   remaining capacity for the second. Callers use `weekLogged?.[id] ?? 0`.
 - **Rule 2 applies to the roster too.** `members` is `[]` while the team
   store hydrates, so an empty state that is not gated on `loaded` tells an
   admin with a full team that they have no team. Both the dashboard's Team view
   and Workload now render a **skeleton** until `loaded`, and only then decide
   between the table and the empty state; the dashboard also surfaces the
   store's `error`. Reports' `time_entries` read is deliberately **not** this
   hook — it has no date filter because it answers an all-time question.

---

## Sprint velocity & burndown

**Project overview → Velocity card** (`ProjectVelocitySection`, under the
timeline) and a **Velocity** column in Reports' projects table. One definition,
**`lib/sprints/velocity.ts`** (pure, `e2e/velocity.spec.ts`), measured in
**estimated hours** — the unit the app plans in; there are no story points.

 - **Committed** = estimated hours of a sprint's tasks. **Completed** = those
   finished **by the sprint's last day** (calendar days, `completed_at` from
   `0047`, falling back to `updated_at`). Work finished after a sprint ended is
   real but is not what that sprint delivered — counting it would make a late
   sprint look as fast as an on-time one.
 - **Velocity** = average Completed of the last **3 ended** sprints
   (`VELOCITY_WINDOW`) that had anything in them; cancelled and still-running
   sprints are excluded (a running one would drag the average down with work in
   flight). `null` — shown as "—", never 0 — until a sprint has ended.
 - **Forecast** = open hours of the project (backlog included) ÷ velocity,
   rounded up to whole sprints, each as long (in working days) as the sprints
   the pace was measured over; the date goes through `addWorkingDays`, so
   weekends, US holidays and approved leave are skipped like everywhere else.
 - **Burndown** = a sprint's unfinished estimated hours at the END of each
   working day, against a straight line to zero; days still to come are not
   drawn. It defaults to the sprint running today. Limitation: the app keeps no
   history of when a task joined a sprint, so mid-sprint additions are drawn as
   if present from day one (no scope-change line).
 - Done tasks with **no estimate** count as 0 h; the card says how many, since
   velocity reads low until they get one.
 - Estimate-scaffolded "sprints" are really **phases** (they can be 1–3 days and
   overlap), so on those projects velocity is per phase, and a forecast can look
   extreme early on. It is a pace check, not a commitment — the help copy says so.

## Work keys — who can be given a task (pricing plan Phase 4)

A **work key** is the workbook's lookup key on a person — `"IT|Level 2"` —
stored in **`profiles.work_keys text[]`** (`0043`). A person may hold several,
one level per discipline (Level 2 already covers Level 1, so holding both says
nothing more). Set in **Team → a member's star button → "Work keys & skills"**
(`WorkKeysEditor`): **admin edits**, everyone else reads. The member row shows
them ("IT L2 · QA Tester L1").

**Matching (`planSchedule` + PTO cover, one rule):** a task's role comes from
its estimate line (`roleOf(li) ?? defaultRoleFor(li, platform)`).
 - **Keys govern per discipline** (`keysGovern`). Once anyone on the roster
   holds an IT key, only people holding a qualifying IT key are eligible for IT
   work — **Level 2 may take Level 1, never the reverse** (`holdsKeyFor`) — and
   platform skill stars only break ties. A task nobody qualifies for is left
   unassigned with *"Nobody holds IT Level 2 — assign manually"* rather than
   handed to a junior.
 - **A discipline nobody holds a key in keeps the skill-only rule, exactly.**
   That is every workspace before an admin sets keys, and it is asserted
   byte-identical in `e2e/work-keys.spec.ts`. Per discipline on purpose:
   giving one designer a Creative key must not change how development is
   assigned.
 - Keys reach work that no skill maps to: a Creative key holder now gets
   design tasks, which were always left for a human before.
 - `buildRoster` keeps someone with keys but no skills (it used to drop anyone
   without skills).
 - **Existing load counts** (`PlanDev.bookedHours`). Each person's calendar is
   pre-filled with the open work they already hold across ALL projects —
   `assignedWork().allocatedHours`, the Workload page's accepted + pending
   figure (rule 8) — worked off from **today**, and new tasks queue behind it.
   Fastest therefore routes work to whoever is actually free; Best-fit keeps the
   strongest person but gives honest dates, and the reason says "after 131h
   already booked". FIFO on purpose (no priorities among booked tasks). Booked
   work that clears **before the project starts** resets to a fresh clock:
   otherwise a busy person could look a day MORE available than a free one and
   win under Fastest (`e2e/booked-load.spec.ts` pins both). Nobody booked →
   plans are byte-identical to before.

> **No role columns on `tasks`, deliberately** (the plan proposed
> `tasks.responsible/level`). A seeded task already links to its line through
> `source_line_item_id`, and the line carries the role — a copy on the task
> would need seeding on convert, a new kind of sync edit, and a backfill, and
> could still drift. Hand-made tasks have no role, as the plan said. Revisit
> only if something outside the estimator (which members cannot read) needs a
> task's role.

> **Admin-set only, enforced by the database.** A key decides who gets work
> and at what seniority, so a member giving themselves `IT|Level 2` is a
> self-promotion. `prevent_role_self_change` refuses any non-admin change to
> `work_keys`; the format is a CHECK (`valid_work_keys`: at most 10, each
> `<role>|Level 1|2`). Role NAMES are validated by the app against
> `RESPONSIBLE_ROLES`, so a future role still needs no migration. Keys are
> readable by every signed-in user, like the rest of the team directory.

> **Stale echoes.** Two quick clicks send two writes, and the realtime echo
> of the first can land after the second's optimistic update and revert the
> store — the next click then saves from the stale list and silently drops a
> key (reproduced ~1 run in 3). `team-store` keeps `pendingKeys` per person and
> ignores echoes that don't match this tab's latest write until the matching
> one arrives; a hydrate clears it. `e2e/work-keys-ui.spec.ts` (12 repeats
> green after the fix) signs in as a throwaway **admin**, because the suite's
> own bot is a manager and managers may only read keys.

---

## Tasks ↔ Workload

**How a dev "finishes" work: they move the task to `done`.** That is the only
signal — there is no per-assignee completion flag, and logging hours does not
complete anything. `isOpen(task, closed)` (`lib/workload/assigned-work.ts`)
is the single definition: **open = `status !== "done"` and its project is not
completed or archived** (`closedProjectIds`, via the `useClosedProjectIds()`
hook). `closed` is a REQUIRED argument of `isOpen` and `assignedWork`, so no
caller can forget it — a finished project's leftover cards used to sit in
Workload, both dashboards, Reports' Overdue and the planner's booked hours for
ever. Set it by dragging the card to the
Done column (`commitTaskMove`) or via the status menu on the card / drawer /
list / table (`updateTask`). Both persist, so Workload updates for that person
and their manager on the next render — the stores are the shared read seam, so
no refetch is involved.

`in_review` and `blocked` deliberately still count as open: the work is not
finished, and a blocked task that vanished from someone's load would hide the
one thing a manager needs to see.

> **One definition, two views.** `assignedWork()` / `capacityFor()` /
> `utilization()` back **both** the "Mine" and "Team" tabs. They previously each
> rolled their own and disagreed about the same person in the same week:
>  - **Team** counted every `assignee_ids` entry (accepted **and** pending);
>    **Mine** counted only `accepted`. A dev with three pending assignments read
>    0 h on their own page while their manager read the full estimate.
>  - **Team** subtracted time off from weekly capacity; **Mine** did not. Someone
>    on three days' leave saw 40 h here and 16 h there.
>
> Both now show **allocated = accepted + pending**, and both say so (`incl. Nh
> pending`), because a manager balancing a sprint cannot pretend unanswered work
> is assigned to nobody, and the person must see the figure being planned against.
> Pending rows carry a badge in the list so they are still identifiable as
> declinable. Rejected/passed assignments never appear at all —
> `respondToAssignment` **deletes** the `task_assignees` row rather than storing a
> status, so `"rejected"`/`"passed"` exist in the type but never in the data.

> **A board write is scoped to its board.** `commitTaskMove` persists the
> destination column's positions filtered by `status` **+ `project_id` +
> `sprint_id`. Filtering on status alone swept in every task in the workspace
> sharing it, so dropping one card into Done rewrote unrelated tasks in other
> projects — N pointless writes, and an `updated_at` bump on rows nobody touched.
> That timestamp is what the on-time-delivery figure reads as a completion time.

**Hours are a separate axis from status.** Logging time inserts a
**`time_entries` row and nothing else** (`appendLoggedHours`); the database
derives the task's `logged_hours` from the entries (`0048`,
`sync_task_logged_hours`) and refuses any direct write to it — admins included,
who correct time by fixing the ENTRY (UPDATE/DELETE on `time_entries` is
admin-only since `0046`). The client used to write the total as an absolute
number, and the drawer let assignees, managers and admins type over it; the
drawer now shows the total read-only with an **Add time** field
(`canLogTime` = accepted assignee). **Logged this wk** comes from
`time_entries` (per-logger rows), **never** from `tasks.logged_hours` — that is
the task's total and credits every assignee in full. Only an **accepted**
assignee may insert an entry (`0017`'s insert policy), not just the UI.

> **Deleting a task keeps its time.** `time_entries.task_id` is
> `on delete set null` since `0048` (it was CASCADE), so deleting a task — or a
> project, which cascades to its tasks — leaves each entry in place, detached,
> still counting for the person who logged it. The delete dialogs say so.

> **"Available" is not spare capacity.** It is `effective weekly capacity −
> logged this week`: the working time left in the week, paired with the logged
> figure beside it. With an unbounded backlog a person can have 40 h left in the
> week and still be 328% allocated — **utilisation** is the number that answers
> that. The label was added because "This wk 0h" read as though it might already
> mean available hours; it never did.

**The count badges open the list behind them.** `TaskBadgePopover` turns
"7 pending" / "1 overdue" into buttons that list the actual tasks, each linking
to its own board (`taskHref`). They were dead ends before: a manager was told a
problem existed and then had to go hunting for which tasks. A **button + popover**
rather than a hover tooltip, deliberately — hover has no equivalent on a phone,
and this is a control, not a hint. The panel is capped at
`min(20rem, 100vw − 2rem)` so it cannot hang off a 375px screen, and scrolls
internally rather than pushing the page. `assignedWork` returns
`overdueTasks` alongside the `overdue` count, derived from it in one place so
the badge and its list can never disagree.

**The workload bar is coloured by task status** (`statusBreakdown` +
`WorkloadBar`, shared by both views). A single-colour bar could only say
"full" — full of work nobody has started, full of work in flight, and full of
work that is **blocked** are three different problems with three different
answers. Over-capacity is signalled by an amber **ring** rather than by
recolouring the fill, so the limit and the composition stay separate signals.
Status colours live in `lib/constants/task-status.ts`: the task card's menu and
the calendar's dots had grown byte-identical copies and the bar would have been a
fourth. `GanttClient` keeps its own on purpose — its bars need tuned opacities so
text stays readable on top.

---

## Calendar & time-off approval

**The calendar is role-scoped.** Admin/manager get a **Mine / Team** toggle (the
same control Workload uses, so the two schedule pages behave alike). Member and
Viewer see **their own** schedule only: their tasks, the sprints of projects they
have work on, and their own leave. It previously showed everyone everything —
every person's PTO *including the free-text note*, and every task in every
project.

**Time off is a REQUEST** (`availability_entries.status`, migration `0034`):
**pending → approved / rejected**, with `reviewed_by` / `reviewed_at` /
`review_note`. A member's entry starts `pending`; an admin/manager's starts
`approved` — they are the approver, so asking them to approve themselves is
theatre — but it still records **`reviewed_by` = that person** and
`reviewed_at`, and **both travel with the INSERT**, not just onto the optimistic
row. Leaving them null made a manager's own leave indistinguishable from the
pre-`0034` rows grandfathered in as `approved`, so "approved by nobody" meant
both *legacy* and *approved by whoever booked it*; setting them only client-side
would have had the store claim a reviewer Postgres never stored, gone on the
next hydrate. `0035`'s trigger nulls these for a **non**-approver only, so an
approver may set them on insert (verified live with a manager JWT). Requests
notify the approvers; decisions notify the requester (with `includeSelf`, since
an approver may decide their own row). Editing the **dates**
of a decided request re-opens it as pending; a note-only tweak does not. Pending
leave renders as a **dashed amber outline** on the calendar and never tints the
day — a request must not look like settled fact; rejected leave is not drawn at all.

> **Only `approved` counts.** `countsAgainstCapacity()`
> (`lib/constants/workload.ts`) is the single guard, applied INSIDE
> `awayWorkdaysInWeek` and `ptoDaysByProfile` rather than at each call site, so
> nothing can forget: a merely requested absence must not shrink someone's
> capacity, must not steer the assignment planner, and must not make a manager
> re-plan around leave that has not been granted. A missing status means the row
> predates `0034`, when every entry was in force the moment it was saved — which
> is why the column defaults to `approved` and existing rows were left alone.

> **`NULL in (...)` is NULL, not false — and that voided the first guard.**
> `0034` wrote `approver boolean := current_user_role() in ('admin','manager')`.
> `current_user_role()` returns NULL when there is no profile row (the
> service-role key being the obvious case), so `if not approver` evaluated to
> `not NULL` = NULL, which is not true, and **both** guards were skipped.
> Verified live: an insert claiming `status='approved'` was stored as approved,
> and a follow-up PATCH returned 200. `0035` wraps it in `coalesce(..., false)`
> so an unrecognised caller **fails closed**. Regression test:
> `e2e/pto-approval-guard.spec.ts`.

> **Reads narrowed too.** `0034` replaced "any authenticated user" with
> *self, or an approver*. Everything that needs the whole roster is already
> admin+manager (Workload's team view, the assignment planner, the admin
> time-off table), so nothing broke — and leave notes stopped being
> world-readable inside the workspace.

**The timeline generator accounts for booked leave.**
`lib/discovery/team-calendar.ts` turns the roster plus everyone's **approved**
time off into a per-day availability factor (0–1), and `addWorkingDays()`
replaces `addBusinessDays` wherever the timeline converts a business-day offset
into a real date. Threaded as an **optional** argument through `computeTimeline`
→ `analyzeDiscovery` / `resultFromQuote` → `estimateDateRange`, so every caller
that does not pass one behaves exactly as before.

 - **The model is team-level, on purpose.** The timeline is computed before
   anyone is assigned, so there is no person whose leave to subtract — only the
   team's. A day at 60% staffing yields 0.6 of a working day; a day nobody is
   available yields nothing and the timeline steps over it. It is the same
   granularity as the estimate it schedules (phase hours for a team). Once work
   is actually assigned, `planSchedule` does the per-person version with real
   `ptoDays`.
 - **`totalBusinessDays` is unchanged** — leave moves *when* work lands, not
   how much there is. Only the dates shift, which is why the Gantt spells out
   "N days later for booked time off": a launch date that quietly slipped reads
   as a bug otherwise.
 - **With no calendar the dates match `addBusinessDays` over any
   holiday-free window** — a workspace that records no time off gets
   byte-identical dates there (`e2e/team-calendar.spec.ts`). It walks the days
   itself rather than delegating, because holidays still apply (next section).
 - **An empty roster returns `null`.** The team store hydrates async;
   stretching a timeline to infinity (or collapsing it) mid-load would be worse
   than ignoring leave for a moment.
 - **`confirmed_at` is optional, so test it for truthiness.** An invitee who
   never accepted carries `undefined`, and a `!== null` check would have counted
   them as a working body — shrinking everyone else's share of each absence.
 - `estimateDateRange` takes the calendar too, so the **PBS purchase order** is
   billed against the range the Gantt actually draws. `useTeamCalendar()` is
   memoised on its store slices; passing a freshly-built object into
   `CreatePoDialog`'s date memo would re-fire the pre-fill effect and reset dates
   the coordinator typed.

**US federal holidays are non-working days everywhere.**
`lib/calendar/us-holidays.ts` computes the eleven, and **four** consumers read
it, so they cannot disagree: the timeline walk (`addWorkingDays`), weekly
capacity (`awayWorkdaysInWeek` + `holidayWorkdaysInWeek`), the assignment
planner (`isWorkday`), and the PTO impact preview (`workdaysInRange`). The
calendar marks them, and the Gantt names them.

 - **The observance rule is the whole game** (5 U.S.C. 6103): a holiday on a
   Saturday is taken the Friday before, on a Sunday the Monday after. Skipping it
   gets ~2 holidays a year wrong — and always the two people notice, because
   they are the ones that move. Only the FIXED-date ones can need it; the
   Monday/Thursday ones are defined as a weekday.
 - **New Year's Day can be observed in the PREVIOUS December.** Jan 1 2028 is
   a Saturday, so the office shuts Fri **2027-12-31**. `usHolidaysInRange` scans
   a year either side for exactly this; building only the years a range names
   would miss it.
 - **Holidays apply with NO calendar at all.** An empty roster still does not
   work on Christmas, so the skip cannot depend on knowing the team — which is
   why `addWorkingDays` no longer short-circuits to `addBusinessDays`. It is
   still byte-identical over a holiday-free window (verified across 40 offsets x
   14 start days, weekend starts included). That shortcut had also been hiding
   something: the old equivalence test passed by **delegation**, so the walk
   itself had never actually been compared.
 - **A holiday is not PTO, and must not be counted twice.**
   `awayWorkdaysInWeek` skips holiday days and `holidayWorkdaysInWeek` counts
   them instead, so a week off over Thanksgiving is *4 days leave + 1 holiday* —
   not 5 + 1, which is six days out of a five-day week and drives capacity
   negative. Both workload views report the two separately: `(40h − 4 days off
   − 1 holiday)`. Same reason the Gantt says "3 days later — Thanksgiving +
   booked time off" rather than one number: a manager can decline somebody's
   leave and cannot decline Christmas.
 - **`OBSERVED_HOLIDAYS`** is one exported list. Firms differ most on **Columbus
   Day** and **Veterans Day** — plenty work both. Changing that is one line
   there rather than a migration, a settings UI and a per-workspace override
   nobody has asked for; that constant is the seam if it ever needs to vary.

**Approving shows what it costs, then a human confirms.** `lib/availability/pto-impact.ts`
(`ptoImpact`, pure) lists the tasks whose **due date falls inside the absence**,
whether anyone else is accepted on them, suggested cover, and any sprint that can
no longer finish. The dialog offers **Approve only** or **Approve + reschedule**;
the reschedule applies `reschedulePatches(impact)` — the same object that was
rendered, never a recompute at write time. Same preview→confirm shape as Start
project, Sync schedule and Create PO.

 - Cover comes from the assignment engine's own rule — **work keys first**
   (see the "Work keys" section), then `skillTiers` via the task's
   phase label in `tags` — so a suggestion here and an auto-assignment there
   cannot disagree. A seeded task's role is read from **its estimate line**
   (`source_line_item_id` → `line_items[].responsible/level`, passed in as
   `roleByLineItem`), and a suggestion shows the key that qualified it
   ("Creative L2"). Someone **approved** away over the same window is excluded;
   someone merely *pending* is not, because that request may yet be refused.
   A hand-made task has no phase, so nothing is invented.
 - Each task's slip is measured to the day **after the absence ends**, not
   by the number of workdays lost — shifting every task by the same five days
   would leave one due on the absence's first day still inside it.
 - **The slip is counted with `addWorkingDays` — the same helper that applies
   it.** It used `addBusinessDays`, which treats a federal holiday as a workday,
   so across a holiday the count and the applied date disagreed: due Wed 25 Nov
   2026, away through Fri 27th, the preview suggested Tue 1 Dec instead of Mon
   30th. Pinned in `pto-impact.spec.ts` (negative control: the old line
   produces `2026-12-01`).

---

## Onboarding tours (? button · welcome · Getting started)

Plan and decisions: [docs/onboarding-tour-plan.md](docs/onboarding-tour-plan.md).
A short guided tour per page (per **tab** on the Estimator editor and Settings),
started from the header's **?** (`HelpMenu`). Engine: **driver.js**, wrapped in
`lib/tours/run.ts` and nowhere else. All copy lives in `lib/tours/tours.ts`.

 - **Tours are read-only.** They explain Send to Zoho, Create PO, Approve,
   Apply buffer... and never press them: driver.js `disableActiveInteraction`
   blocks the highlighted control, and a capture-phase listener swallows page
   shortcuts while a tour is open (the board opens New task on **n**).
   `e2e/tours.spec.ts` fails on any non-GET except `tour_progress` during a tour.
 - **Anchors are `data-tour` ids from `lib/tours/ids.ts`**, spread with
   `tourAnchor("...")` — never classes or text. One id may sit on several
   elements (the nav is a sidebar from md and a tab bar below); the first
   VISIBLE one wins. A step whose target isn't on screen is skipped, which is
   how loading and empty pages show fewer steps rather than a popover pointing
   at nothing. The spec fails on any `data-tour` value not in `TOUR_TARGETS`.
 - **Role-aware with the same flags as the page**: a step has `when(ctx)` on
   `usePermissions()` + page access, so a Viewer is never told about a button
   they don't have.
 - **Several tours on one route** (Mine/Team, tabs) pick by `scope`: the tour
   whose scope anchor is visible applies. Radix unmounts inactive tab panels,
   so the active tab's anchor is the only one present.
 - **Tour copy restates feature behaviour.** Change it in the same commit as
   the feature, and bump that tour's `version` — that re-offers it (the dot).
 - **Newcomer vs existing** is `profiles.confirmed_at` vs `TOURS_LAUNCHED_AT`
   (`use-tours.ts`); a null `confirmed_at` (bootstrap admin) is existing.
   Newcomers: the welcome dialog once, **on /dashboard only**, then one nudge
   toast per page tour (never an auto-start, and not on the dashboard, which
   the dialog already covered). Existing users: one "New: page tours" toast.
   The e2e bot is seeded with a fixed past `confirmed_at` and the hint already
   seen, so none of this sits on top of other tests.
 - **End of tour = `onDestroyStarted`, not `onDestroyed`.** driver.js skips
   `onDestroyed` when its active element isn't set yet — it is set a few
   animation frames after the popover renders — so clicking Done quickly ended
   the tour unrecorded and left the ? button disabled. For the same reason the
   runner never reads `getActiveElement()`; it uses its own step list. Seeing
   the last step counts as completed however it was closed.
 - **Phones (< md)** dock the popover as a sheet on the edge away from the
   highlighted element (`app-tour--sheet` / `--top` in `globals.css`, which
   beat driver.js's inline positions with `!important`); a centred step stays
   centred, or driver.js's placeholder cut-out shows as a dot.
 - **A tour never starts over an open Radix dialog** — the dialog makes the
   page inert, so the popover would be unclickable. The runner reports
   "blocked" and says so.
 - **`tour_progress` (0045) is not a `profiles` column** — profiles is on the
   realtime channel, so every finished tour would broadcast to every client.
   Self-only RLS (probe P17), no realtime. A failed write is deliberately not
   rolled back: the local copy keeps the person from being re-nagged.
 - **Getting started checklist** (`GettingStartedCard`, Dashboard → Mine, top
   of the sidebar column): every item is DERIVED from real data
   (`lib/tours/checklist.ts`, pure, tested both ways) — avatar, own
   `weekly_capacity` row, accepted assignments, any `time_entries`, a project /
   estimate **you own**, team size, Zoho status. Only its dismissal is stored.
   N/A items ("Nothing assigned to you yet") never block 100%. Members get no
   "weekly hours" item: they have no screen to set their own (the inputs are on
   Workload's Team view). "Your first estimate" reads `proposals.owner_id`,
   now mapped **read-only** in `rowToQuote` (never sent by
   `quoteUpdatePayload`). *Show me* sets a pending tour + navigates; TourHost
   starts it at that step once the page renders. Settings accepts `?tab=` for
   this (the Zoho item lands on Workspace).

## Invites & password setup

**The flow:** Team → invite (admin) → `/api/invites` allow-lists the email and
calls `inviteUserByEmail` → the email link → **`/auth/confirm`** (a page with a
**Continue** button that spends the one-time token only on a real click) →
`/accept-invite` (choose a password) → `/dashboard`.

> **Email scanners spend one-time links.** Microsoft Defender / SafeLinks
> opens every link in a work inbox before the person does. Supabase's DEFAULT
> invite template links to its own `/auth/v1/verify`, which spends the token on
> that GET — so the SCANNER accepted the invite (account confirmed, a sign-in
> recorded in the same millisecond), and the person's click landed on the home
> page with `#error_code=otp_expired`, no session and no password. Re-inviting
> refused ("already has an active account"), so they were locked out. Hit live
> 2026-10-03.

**What the app does about it** (`lib/auth/setup-link.ts`):

 - **Password setup links.** `createSetupLink` generates a `recovery` token
   and points it at OUR `/auth/confirm?token_hash=…&type=recovery&next=/accept-invite`,
   so a scanner opening it spends nothing. Verified live: it works for a pending
   invitee (and confirms them) and for a scanner-confirmed account. A new
   recovery link cancels the previous one; it does NOT cancel the emailed invite.
 - **Where admins get one:** every successful invite returns a backup link
   (shown in `SetupLinkDialog`); re-inviting a scanner-confirmed account returns
   one instead of an error (and sends no email, deletes nothing); and the
   **key button** on a member row (Team) and a pending-invite row calls
   `POST /api/invites/link`.
 - **Never for someone who already has a password** — a setup link signs its
   holder in as that person. `app_metadata.password_set` (service-key only, so
   the user can't clear it) is set by `POST /api/auth/password-set` when
   `/accept-invite` saves a password and on every password sign-in
   (`useAuth.signIn`). Existing accounts were backfilled once by
   `scripts/backfill-password-set.mjs` (signed in >10 min after confirming = has
   a password; a scanner signs in at the confirm instant and is left unmarked).
 - **A used-up link explains itself.** `InviteHashCatcher` (home page) and
   `/accept-invite` read `#access_token` / `#error` from the hash; an error goes
   to `/login?error=link_expired`, which says what happened and how to get a
   link. `/forgot-password` is public now — it used to bounce signed-out people
   to `/login`, so that way out never worked.
 - The confirmed-but-unset account is never deleted to "re-invite" it: it may
   already be on tasks. Only a never-confirmed invite is deleted and resent.

**Supabase dashboard settings this depends on** (Authentication → Emails /
URL Configuration — not in the repo):

 - **Invite user** template link:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite`
 - **Reset password** template link:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/accept-invite`
 - **Site URL** = the production domain; **Redirect URLs** include
   `<production>/**` and `http://localhost:3000/**`.
 - With the default `{{ .ConfirmationURL }}` the emailed link stays
   scanner-burnable; the setup links above still work regardless.
 - **Custom SMTP = Resend** (decided 2026-10-14). Supabase's built-in sender
   is for testing only (~2 emails/hour, and only to the org's own team), so
   invites to real staff silently never arrived. Settings → Authentication →
   Emails → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password =
   a Resend API key, sender on a verified subdomain
   (`no-reply@mail.strategicconnection.net`); then raise **Authentication →
   Rate Limits → emails**. Not Microsoft 365 SMTP: Supabase needs
   username/password SMTP auth, which Microsoft is retiring. Until it is live,
   the setup-link key button (no email) is the way in.

`e2e/invite-setup-link.spec.ts` reproduces the scanner (a server-side verify of
a one-time token) and walks the way out end to end, including both refusals.

## State Management Map

> **Live mode:** each store hydrates from Supabase (via `WorkspaceSync`) and writes through
> optimistically — the synced-store bridge, **not** TanStack Query. **Demo mode** (no env vars):
> the same stores persist to `localStorage` (keys prefixed `timeline-`; full list in
> [docs/data-mapping.md](docs/data-mapping.md)). The keys below are the **demo-mode** storage.

| State                          | Lives In                                  | Persist key / note                       |
| ------------------------------ | ----------------------------------------- | ---------------------------------------- |
| User session + role            | `store/auth-store.ts` (mirrors Supabase Auth) | `timeline-auth` (demo only; live = httpOnly cookie) |
| Projects list                  | `store/projects-store.ts`                  | `timeline-projects`                       |
| Sprints list                   | `store/sprints-store.ts`                   | `timeline-sprints`                        |
| Tasks (+ nested comments)      | `store/tasks-store.ts`                     | `timeline-tasks`                          |
| Proposal quotes & line items   | `store/proposal-estimator-store.ts`        | `timeline-proposal-estimator`             |
| PTO / availability             | `store/availability-store.ts`              | `timeline-availability`                   |
| Weekly capacity overrides      | `store/weekly-capacity-store.ts`           | `timeline-weekly-capacity`                |
| Hourly rates (role + level)    | `store/hourly-rates-store.ts`              | `timeline-hourly-rates`                   |
| Onboarding tours seen          | `store/tour-store.ts`                      | `timeline-tours` — persisted in **live** mode too (a local copy of `tour_progress`, so the welcome dialog can't flash before the read) |
| Notifications + activity feed  | `store/notifications-store.ts`             | `timeline-notifications`                  |
| Task board pane / active view  | tasks store (ephemeral slice)              | not persisted (`selectedTaskId`, `activeView`) |
| Dashboard / Workload / Calendar scope | local `useState` in each page          | not persisted — `MineTeamToggle`, defaults to Mine on the dashboard |
| Task timers                    | `useTaskTimerStore`                        | ephemeral session state                  |
| Theme (light/dark)             | next-themes                                | client preference                        |
| Permissions (derived)          | `usePermissions()` over auth role          | not stored — computed from role          |

---

## User Roles & Permissions

| Permission       | Admin | Manager | Member | Viewer |
| ---------------- | ----- | ------- | ------ | ------ |
| Create project   | Yes   | Yes     | No     | No     |
| Edit project     | Yes   | Yes     | No     | No     |
| Delete project   | Yes   | No      | No     | No     |
| Create task      | Yes   | Yes     | Yes    | No     |
| Edit task        | Yes   | Yes     | Yes    | No     |
| Delete task      | Yes   | Yes     | No     | No     |
| Manage team (invite / deactivate / delete member) | Yes | No | No | No |
| View all content | Yes   | Yes     | Yes    | Yes    |
| Export proposals | Yes   | Yes     | No     | No     |
| Estimator (scope + client quotes) | Yes | Yes | No | No |
| Edit others' PTO/availability | Yes | Yes | No | No |
| Approve / reject time off | Yes | Yes | No | No |
| See the whole team's calendar | Yes | Yes | No | No |
| Read Zoho CRM data (deals/accounts/contacts) | Yes | Yes | No | No |
| Connect / disconnect Zoho CRM | Yes | No | No | No |
| See hourly rates | Yes | Yes | No | No |
| Change hourly rates | Yes | No | No | No |
| Set work keys (who can be given a task) | Yes | No | No | No |
| Own onboarding tour progress | Yes | Yes | Yes | Yes |

> **Estimator** uses the same gates as **Export proposals** — use `canExportProposals` in the UI.
> **Offboarding** (deactivate/reactivate + permanent delete) and **invites** are admin-only, via
> `/api/users/[id]/status`, `/api/users/[id]`, and `/api/invites` (service-role, server-side).
> **Zoho** reads are gated server-side by `requireZohoReader()` (admin+manager, since CRM records
> are PII); connect/disconnect use `requireAdmin()`.
>
> Permissions are enforced by **Supabase RLS** (`supabase/migrations/0002_rls.sql`). The UI uses
> `usePermissions()` to show/hide controls — keep the two in lockstep.
> VIEWER role: action buttons are hidden entirely, not just disabled.

---

## Environment Variables

```env
# .env.local — never commit this file (see .env.example for the full template)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key   # public by design; RLS protects data
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key      # server-only — never NEXT_PUBLIC_
NEXT_PUBLIC_APP_NAME=Timeline Estimator
NEXT_PUBLIC_APP_ENV=development
```

---

## Coding Patterns I Follow

### Data Access Pattern (synced-store bridge)

> Components never call Supabase directly — they read a Zustand store (or a thin `hooks/` wrapper).
> The store hydrates from Supabase via `WorkspaceSync` and does optimistic **write-through + rollback**;
> the same store serves the `localStorage` demo behind `isSupabaseConfigured`. Realtime echoes are
> idempotent, so a store's own write is harmless. (No TanStack Query — the bridge covers caching.)

```ts
// store/tasks-store.ts (shape) — one action handles live + demo in one place
createTask: (input) => {
  const id = isSupabaseConfigured ? crypto.randomUUID() : nextLocalId();
  const task = { ...input, id /* …defaults… */ };
  set((s) => ({ tasks: [task, ...s.tasks] })); // 1. optimistic UI update

  if (!isSupabaseConfigured) return id;         // demo: localStorage persist only

  void (async () => {                            // 2. write through to Supabase
    const supabase = createClient();             // lib/supabase/client.ts
    const { error } = await supabase.from("tasks").insert({ id, ...input });
    if (error) {                                 // 3. roll back + surface the RLS/DB error
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      toast.error("Couldn't create task", { description: parseSupabaseError(error) });
    }
  })();
  return id;
},

// Component / hook just reads the store — never touches Supabase:
const tasks = useTasks();
const createTask = useTasksDataStore((s) => s.createTask);
```

### Form Pattern

```ts
const schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  due_date: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  mode: "onBlur",
});
```

### Permission Gate Pattern

```tsx
const { canCreateTask } = usePermissions();
// ...
{
  canCreateTask && <Button onClick={openCreateModal}>Add Task</Button>;
}
```

### Empty State Pattern

```tsx
if (!tasks.length) {
  return (
    <EmptyState
      icon={<CheckSquare size={48} className="text-muted-foreground" />}
      title="No tasks yet"
      description="Add your first task to start tracking work"
      action={<Button onClick={openCreateModal}>Add Task</Button>}
    />
  );
}
```

---

## Things To Always Remember

1. **Complete the data layer first.** Define the table/types → write the Supabase query in a hook
   → build UI. Never scaffold a UI component before the hook exists.

2. **Never skip three states.** Every data-fetching component needs: loading skeleton, error
   message, and empty state. If any of these are missing, the feature is not done.

3. **Schema is in-repo — keep it the source of truth.** Tables and RLS live in
   `supabase/migrations/`. Change a shape there, run `npm run db:types`, and keep
   `usePermissions()` aligned with the RLS policies. Don't guess column shapes.

4. **Optimistic updates on drag-drop and status changes.** These interactions feel broken
   if they wait for a server round-trip. Update UI instantly, sync to Supabase in background.

5. **Mobile is not an afterthought.** Check every page on 375px width before calling it done.
   Neither the Gantt nor the Calendar falls back to a list on mobile — the Calendar keeps its month grid (it fits 375px) and the Gantt keeps its chart inside a horizontal scroller with swipe hints. Both verified.

   **Three layout tiers, not two** — `md` (768px) is *iPad portrait*, not a desktop:
   - `< md` — no sidebar, bottom tab bar + drawer
   - `md–lg` — **64px icon rail** (`w-16`, labels/group headings/wordmark hidden, `title` tooltips
     keep icons identifiable). Gives ~664px of content on iPad portrait; a full `w-56` sidebar there
     left only ~504px — *narrower than the same device with no sidebar at all*.
   - `lg+` — full sidebar with labels (`lg:w-56`, `xl:w-64`)

   **A reading-width cap belongs on the CONTENT, not the page.** The Estimator
   put `max-w-3xl` on its page root, which starved its own header: 768px cannot
   seat a five-control actions row beside a title, so at a 1920 viewport the
   `h1` collapsed to **85px** and the description wrapped one word per line
   inside a 1600px shell (all measured, not guessed). The cap now sits on the
   card `<ul>` — the thing that wants a comfortable column — leaving the header
   and the stage board the whole shell. `WorkspacePageHeader` is
   `overflow-hidden`, so anything that does not fit is **invisible rather than
   cramped**, with no scrollbar to hint at it; that is how **New estimate** came
   to be sliced off. Its actions cap is `xl:max-w-md` / `2xl:max-w-2xl` (raised
   from `max-w-xl`, which clipped 611px of controls into 576px), and heavy
   actions rows should carry `sm:flex-wrap` so they wrap instead of clipping.
   `e2e/page-header-fit.spec.ts` walks every page at all three widths and fails
   on any control outside its header, or any page that scrolls sideways.
   **`e2e/layout-integrity.spec.ts`** guards the body the same way: the document
   and `main` must not scroll sideways, nothing may reach past `main` without an
   inner scroller to bring it back, and no two non-nested controls may overlap
   by more than 4px in both axes (one of them would be unclickable, and which
   one is a coin toss). Overlap compares each control's **visible** box
   (`visibleRect`: clipped by every overflow ancestor up to, not including,
   `main`) — the Gantt scrolls its rows in its own box, so a bar further down has
   a layout position over the next card while being invisible, and the raw-box
   check flagged it "over" the Velocity card's help button. A negative control in
   the same spec proves it still catches two genuinely overlapping buttons.

   > **`main` is itself `overflow-x: auto`.** A scroller check that asks
   > "is this inside *any* scroller?" therefore skips the entire page and
   > passes by doing nothing — that is how the first version of this spec
   > shipped green while being completely inert, caught only by a negative
   > control (a 5000px div measured at `right=5280` in a 1280 viewport and
   > scored zero). The question has to be **which** scroller: overflowing
   > `main` is the bug, overflowing a deliberate inner one (Gantt, wide table,
   > the stage-board strip) is the design. Any new layout assertion needs a
   > negative control before it is trusted.

   **A strip that scrolls sideways reads as a strip that ends.** Overlay
   scrollbars are invisible on touch and idle desktops, so tabs and filter pills
   that overflow hide their last items with no hint — the estimator's *Review*
   tab (where Send to Zoho lives) sat off a 375px screen exactly this way.
   Prefer `flex-wrap` under `sm:` over `overflow-x-auto`, and never pair
   overflow with `[scrollbar-width:none]`. Reserve scrolling for content that
   genuinely cannot wrap (Gantt, wide tables) — those get their own container.

   **The top bar on a phone is four controls: ☰, ?, 🔔, +.** Under `sm` the
   breadcrumb shows only the current page (no separators), the theme toggle
   moves into the drawer, and "Add task" is a `+` icon. "New project" and the
   + menu's *Create project* are hidden at every width while blank projects
   are off (`BLANK_PROJECTS_ENABLED`). At 375px the
   row used to carry six controls and cut the page name to "DA…".

   **The Estimator's five tabs are ONE row at every width.** Under `sm`,
   "Scope & risk" and "Line items" show *Scope* / *Lines*; the full label stays
   the accessible name (`aria-hidden` short span + `max-sm:sr-only` long span),
   so screen readers and `getByRole("tab", { name: /^line items/i })` read the
   same thing everywhere. Two wrapped rows read as two levels of navigation.

   So gate multi-column grids on **`lg:`**, not `sm:`/`md:` — `sm:grid-cols-3` fires at 640px but the
   *content area* on a tablet is far narrower than the viewport suggests.

6. **Confirm before destroy.** Every delete, archive, or destructive action needs a
   ConfirmDialog that names exactly what will be affected.

7. **Security is not optional.** httpOnly cookies, DOMPurify on user content, Zod on all
   inputs. No exceptions, even for "internal" features.

8. **One definition per number, shared.** A DATE column is read with
   `parseISO`, never `new Date()`, and written as `format(d, "yyyy-MM-dd")`,
   never `toISOString()` — the task due-date pickers stored the day BEFORE the
   one clicked east of Greenwich, and the board showed it a day early west of
   it (fixed 2026-10-09 in the task card, list, table, drawer and both modals). Reports, Workload and the Dashboard each
   hand-rolled the same date maths and disagreed on screen: `new Date(due_date) < now`
   treats a DATE column as midnight **UTC**, so a task due *today* counted as overdue
   from 08:00 local (and from the previous evening in a negative-offset zone) — Reports
   said 7 overdue where 6 were late while the Dashboard called the same task "Today".
   Use `lib/utils/relative-dates.ts` (`daysUntil` / `isOverdue` / `relativeDay`, built on
   date-fns `parseISO` + `differenceInCalendarDays`), never a fresh comparison.
   Same rule for hours: **per-person** time comes from `time_entries` (one row per
   logger); `tasks.logged_hours` is the TASK's cached total and credits every assignee
   in full, so summing it per member double-counts shared work.
   Same rule for **non-working days**: `lib/calendar/us-holidays.ts` is the only
   definition of a holiday, read by the timeline, weekly capacity, the assignment
   planner and the PTO impact preview — four places that would otherwise each
   decide whether work happens on Christmas.
   Same rule for **workload**: `lib/workload/assigned-work.ts` is the only definition
   of what a person is carrying. "Mine" and "Team" had drifted into answering it two
   ways — Team counted pending assignments in the utilisation bar and subtracted time
   off from capacity, Mine did neither — so the same person in the same week read
   differently on their own page and their manager's.

---

> Maintainer: Frontend Dev · Last updated: 2026-10-14
> Update this file whenever the project scope, stack, or patterns change.
