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
| 4     | Integrations, Performance, WCAG  | Realtime + Storage (avatars) done; RLS/security audit done. **Perf + WCAG passes still pending** |

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
├── common/             # coming-soon, shared bits
├── features/
│   ├── projects/       # ProjectsPage, ProjectCard, Create/Edit/Delete modals
│   ├── proposals/      # Estimator: editor (Scope & risk + Line items tabs), CatalogBrowser, AddonsCard, DependencyAlert, PDF preview mock, access-denied
│   ├── discovery/      # guided-scope UI reused BY the Estimator (no standalone route): DiscoveryWizard, Gantt, HoursBreakdown, RiskBadge, Field
│   ├── sprints/        # ProjectOverviewPage, SprintCard, Create/Edit/Delete modals
│   ├── tasks/          # TasksPage, KanbanBoard/Column, TaskCard, TaskDetailDrawer, list/table views, comments, time tracker, modals
│   ├── gantt/          # GanttClient
│   ├── workload/       # WorkloadClient, MemberWeeklyHoursInput
│   ├── activity/       # ActivityFeedClient/List
│   ├── notifications/  # NotificationBell
│   └── settings/       # ProfileForm, TimeOffSettingsSection, AdminTeamTimeOffSection
└── layouts/            # dashboard-header, sidebar-nav, mobile-menu, mobile-tab-bar, nav-config, page-header, app-providers, app-atmosphere
hooks/                  # usePermissions, useProjects, useSprints, useTasks, useTimeTrackingAccess
lib/
├── utils/              # cn, dates, initials, activity-feed, gantt-layout, share-links, proposal-pdf/excel-export, availability-dates
├── validations/        # Zod schemas (profile.schema.ts so far)
├── dummy/              # demo data: projects, sprints, tasks (+ TEAM_MEMBERS)
├── constants/          # projects, sprints, proposal-estimator, workload, task-focus
├── proposal-catalog/   # catalog.json + index (platform → catalog rows)
├── discovery/          # guided-scope rules engine (analyzeDiscovery) + to-proposal bridge + from-esther seed
├── activity/           # workspace-push (append activity/notifications)
├── collaboration/      # notify-task-activity
├── undo/               # offer-undo-toast (one-shot Undo)
└── supabase/           # client.ts (browser), server.ts (RSC seam), middleware.ts + config.ts + parse-error.ts — wired
store/                  # Zustand (live via WorkspaceSync + optimistic write-through; demo persists to localStorage):
                        #   projects, sprints, tasks, auth, team, availability, activity,
                        #   notifications, weekly-capacity, proposal-estimator
types/                  # project, sprint, task, proposal, availability, database (generated — `npm run db:types`)
docs/                   # data-mapping.md (data shapes) + backend-supabase.md + supabase-integration-plan.md
supabase/               # migrations/ 0001 schema · 0002 rls · 0003–0009 mentions/realtime/activity/storage/role-guard ·
                        #   0012/0014/0021 invite-only + pending state · 0015/0016/0017 workflow (proposal status, assignment lifecycle, time_entries) ·
                        #   0018 logged-hours guard · 0019/0020 offboarding (deactivate/hard-delete) · 0022 proposals.discovery ·
                        #   0023 migrate+drop discovery_projects · 0024 page-access heal ·
                        #   0025 notification actor · 0026 member_skills · 0027 security phase 1 ·
                        #   0028 zoho_connection · 0029 proposals.zoho + README — `npm run db:push`
project-csv/            # "tasks and integration.xlsx" — source for the proposal catalog
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
- `server.ts` — server client for Server Components / Route Handlers / Server Actions (seam; not yet imported).
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
| `tasks` (+ `task_assignees` w/ status) | select / insert / update / delete + Realtime | `tasks-store` / `useTasks` | Wired |
| `time_entries` (hour attribution)     | select / insert                   | `tasks-store` (logged via accepted assignees) | Wired |
| `task_comments` (+ `comment_reactions`)| select / insert / update / delete + Realtime | `tasks-store` / `TaskCommentSection` | Wired |
| `profiles` (team directory)           | select                     | `team-store` / `useTeamMembers` | Wired |
| `notifications`                       | select / insert / update / delete + Realtime | `notifications-store` | Wired |
| `activity` (workspace log)            | select / insert + Realtime | `activity-store`            | Wired |
| `availability_entries`                | select / insert / update / delete | `availability-store` (calendar, Settings time-off, **and Workload capacity** — a day off removes `weeklyHours / 5` from that week via `awayWorkdaysInWeek` + `capacityAfterTimeOff`; Mon–Fri only, `partial` counts half) | Wired |
| `weekly_capacity`                     | select / upsert            | `weekly-capacity-store` (workload) | Wired |
| `proposals` (`line_items` + `addons` + `discovery` jsonb) | select / insert / update / delete | `proposal-estimator-store` (Estimator) | Wired |
| Storage `avatars` bucket              | upload / getPublicUrl      | `ProfileForm` → `profiles.avatar_url` | Wired |
| `zoho_connection` (OAuth tokens)      | service-role only (RLS: **no policies**) | `lib/zoho/tokens.ts` via `/api/zoho/*` | Wired |
| `proposals.zoho` (CRM link jsonb)     | select / insert / update   | `proposal-estimator-store` (deal/account/contact link) | Wired |

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

**Editor tabs (`ProposalEditorClient`):** Setup · **Scope & risk** (guided questionnaire + Hours + Timeline/Gantt + "Generate line items") · **Line items** (catalog/freehand) · **Adjust** (add-ons + totals) · **Review** (PDF/Excel). **Every estimate has both tabs** — the New-estimate dialog does *not* ask which one you want, because the choice was never binding: it only picked a landing tab. A new estimate opens on Line items with a starter row; **"Start guided scoping"** (Scope & risk empty state) attaches the questionnaire whenever it's wanted, mirroring the platform via `syncDiscoveryToQuote`. An estimate that arrives *with* answers (Esther brief) still opens on Scope & risk.

**Pricing:** every price is **hours × `HOURLY_RATE`** (`lib/constants/proposal-estimator.ts`, currently **$100/h**) — the estimator computes effort, and effort is what's sold. `amountForHours()` / `formatAmount()` / `priceForHours()` are the only money helpers; amounts appear on the editor header, the totals panel, the list cards, the PDF (per line + roll-up) and the Excel export (as **numbers**, so a spreadsheet can sum them). One constant, deliberately — a per-client rate would need a `proposals` column (plus **both** update whitelists), an editor field, and a rule for which rate an existing quote keeps when the default moves.

**Products → Packages rows:** products picked from the CRM (`zoho.products`) get an hours share **derived** from the estimate — `splitHours(total, n)`, even, with rounding drift on the first share so the parts always sum to exactly the total. Nothing is typed: the estimator computed the hours, and a second hand-entered copy could only disagree with it. A row's price is its share x `HOURLY_RATE` — **computed, not the catalogue `unit_price`** (kept for reference only). The Setup table and the create-deal dialog both render from the same call, so the review can't disagree with what's sent. Writing real rows to Zoho is still blocked on the Packages subform's API names (`/api/zoho/health` → `dealSubforms`); until then the priced breakdown goes in the deal's `Description`.

**Line-item math:** `base_hours × tierMultiplier × quantity` — **Basic 1× / Advanced 1.5× / Custom 2×** (`TIER_MULTIPLIERS`). **Roll-up add-ons** compound on dev hours: `responsive = dev × pct` → `design = (…) × pct` → `qa = (…) × pct` → `pm = (…) × pct` (defaults PM 10 / Responsive 25 / Design 35 / QA 20 %, each toggleable — `DEFAULT_ADDONS`). Guided estimates ship with add-ons **off** (phases already itemise design/QA/PM).

**Approval → project:** a quote has a `status` (**draft → sent → approved/rejected**). When **approved**, **Start project** opens a **two-step dialog**: options → **Review schedule** (`previewConversion` computes sprints/tasks/assignees/dates and writes **nothing**) → **Confirm & create**. The reviewed `SchedulePreview` is passed back into `convertToProject`, which persists **exactly** what was shown rather than recomputing (roster/PTO could change mid-review). "Sync schedule from estimate" on a project uses the same preview → confirm flow via `previewSchedule` + `regenerateSchedule`. `convertToProject` creates a real project and **scaffolds the tentative timeline into sprints** — one sprint per estimate phase (status `planning`, carrying the phase's computed start/end dates), with each seeded task slotted into its phase's sprint (join key = `phaseLabelForLineItem` ↔ `PHASE_META[id].label`).

> ⚠️ **Only the 7 phase labels have delivery meaning.** `phaseLabelForLineItem`
> returns the row's `module` when it is one of `PHASE_META`'s labels and
> **falls back to `Development`** otherwise — so nothing is ever "unmatched",
> and nothing lands in the backlog on conversion. The practical consequence is
> that the **59 catalog modules** (`lib/proposal-catalog/catalog.json` — "Homepage
> - Standard", "Pre-Launch QA", "SEO"…) are a **scope taxonomy only**: they group
> rows in the Line items tab and the PDF, and carry no dates, colour or phase.
> A catalog-built quote therefore schedules as **one Development sprint**, and its
> Design/QA/PM phases come from the **add-on percentages**, not from its modules
> (`resultFromQuote`). Mapping catalog modules onto phases would change that; it
> is deliberately not done today. This is a **draft schedule** the manager then adjusts (sprint dates, task hours/assignees) into the plan the team follows — the project's timeline **is** its sprints, rendered by the Gantt (embedded on the project overview via `<GanttClient lockedProjectId={…} />`). Links `proposals.project_id`.

**Output:** in-browser **PDF preview mock** + real **PDF** (jsPDF) and **Excel** (xlsx) export — `lib/utils/proposal-pdf-export.ts`, `proposal-excel-export.ts`. Optional server-side export (Edge Function → Storage) is still a later path.

**Data:** `store/proposal-estimator-store.ts` (Zustand + persist demo key `timeline-proposal-estimator`; live via the `proposals` table — `line_items` + `addons` + `discovery` as JSONB). The old standalone `discovery_projects` table was migrated into `proposals.discovery` and dropped (`0022`–`0023`). **Catalog source:** `lib/proposal-catalog/catalog.json` (from `project-csv/tasks and integration.xlsx`).

**Permissions:** **Admin + Manager only** — gate with **`canExportProposals`** from `usePermissions()`. Member/Viewer must not see entry points or mutating controls. Enforced by RLS on `proposals`.

---

## Zoho CRM Integration (read-only)

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

> ⚠️ The scope string is **not** what limits this app. **`lib/zoho/write-allowlist.ts`** is:
> `zohoFetch` refuses any non-GET that isn't on it, before the request leaves the process.
> Today that's exactly three writes — create a deal, move a deal's stage, attach a file to a
> deal. Adding a write means adding a line there, which is the point: it shows up in review.

**Features consuming CRM data** (both gated admin+manager by `requireZohoReader()` — CRM records are PII):

| Feature | Route | What it does |
| ------- | ----- | ------------ |
| **Deal → Estimate import** | `/api/zoho/deals` | Estimator → "Import from Zoho": pick a Deal (by stage — *Proposal Requested* is the quote trigger — or free-text) → creates a pre-filled quote, **and advances the Deal to "Discovery"** (see the push row: scoping starts here, so the CRM says so). Linking a deal to an existing quote from the editor does the same |
| **Deal refresh (Zoho → app)** | `/api/zoho/deals/stages` | Opening the Estimator list or an estimate re-reads the linked Deals' `Stage`, `Amount` **and Packages row count** in one batched call (`useZohoStageRefresh`) and stores stage/amount only when they actually changed — writing every view would bump `updated_at` and reshuffle the list. This is what keeps `ZohoStageBadge` honest when **sales** moves a deal; there is no push/webhook (that needs `ZohoCRM.notifications.ALL` + re-consent + a channel-renewal cron). Zoho has no by-ids read on our scopes, so it fans out over single-record GETs, capped at 25. **`Amount` is stored, never applied**: it is Zoho's number (derived from the Packages subform) and the estimate's line items are this app's, so a CRM reprice shows up beside the estimate — amber, on the Setup panel — instead of silently rewriting it. The row count is what lets the send dialog say how many rows it is about to replace — and it is `null`, never `0`, when the subform can't be resolved: reporting 0 there would tell the dialog "nothing to replace" and drop the warning before an irreversible overwrite |
| **Products** | `/api/zoho/products` | Estimator → Setup → "Add from Zoho": the live **Products** module behind category filter pills (same pattern as the deal picker), multi-select, stored on the quote as `zoho.products`. Covered by the existing `ZohoCRM.modules.READ` — no new scope, no CSV snapshot. Records are fetched **without** a `fields` filter because this org files products under two things: the standard `Product_Category` (Creative/Sysdev/Phone/…) **and** a custom `CATEGORY` field (ONBOARDING/SEO/…), whose API name can't be assumed — `lib/zoho/products.ts` picks both out case-insensitively and groups by the custom one first. **Not written onto the Deal** yet: the "Packages" subform's API name is unknown, so for now the picked names ride along in the new deal's `Description` |
| **Client lookup** | `/api/zoho/accounts` | "Find in Zoho" on the Client field — available in **both** the New-estimate dialog and the editor's Setup tab. Search **Accounts** (companies), then pick a **Contact** (a company has many). Falls back to searching people when no company matches. Each company shows its **prior deals** — enriched with ONE batched `Account_Name:in:<ids>` query (never per-account: that would be 25 calls per search) |
| **Create deal** (write) | `POST /api/zoho/deals` | The inverse of import: a hand-made estimate opens a **new** Deal. **One button does both directions**: editor **Review** tab → **"Send to Zoho"** creates the deal when none is linked and updates the linked one when there is (`ZohoSendDialog`), always behind a preview of exactly what will be written. Deliberately the last step, and deliberately not two buttons in two places — which of the two you needed was bookkeeping the user shouldn't have to work out. Setup only offers *linking* an existing deal. Writes `Deal_Name`, `Stage`, `Closing_Date`, `Account_Name`, optional `Contact_Name` + `Description` — never `Amount`/`Quote_number`. **Requires an existing Account** (`zoho.account_id` via "Find in Zoho"); this app never creates a company. Stage is limited to `Discovery` or `Proposal Sent`, and **the proposal PDF is attached either way** — sales reads it during Discovery, not only once the quote is formally sent. **Duplicate-proof**: refuses a quote that already has `deal_id`, and claims the row with a compare-and-set (`zoho.creating_at`, 2-min TTL) before calling Zoho — there is no DELETE scope, so a duplicate deal is a manual cleanup. Needs `ZohoCRM.modules.deals.CREATE`, so it 401s until someone does Disconnect → Connect with the wider scopes |
| **Estimate → Deal content** | `lib/zoho/deal-estimate-sync.ts` | Both "Create deal" and "Push to Zoho" put the estimate's **Packages rows** (one per `zoho.products` entry: Product lookup + Unit Price = its `splitHours` share x `HOURLY_RATE`) onto the Deal, plus the Description on push. **The row's Description column carries the product's own catalogue description**, read live from the Products module — that is what someone opening the deal wants to read; the "N h at $R/h" note is only the fallback for a catalogue entry that has none. It is shown in the send dialog under each product, so the review matches what is written. Both the picker and the row bound it with `truncateAtWord` (`lib/zoho/products.ts`) rather than a hard `slice`: a sentence cut mid-word ("…server-side scripting lang") reads as corrupted data in a CRM field, not as an excerpt. **A quote with no products still carries its price**: `estimateTotalRow` writes ONE row with `Unit_Price` = the whole estimate and no Product lookup (`Product` is `required: false` on this subform, verified live) — and that price only reaches Zoho this way, because `Amount` is recomputed from these rows. **Nothing is hardcoded**: the subform and its columns are resolved from live field metadata by LABEL and type (`findPackagesSubform`), because custom API names can't be guessed — this org's "CATEGORY" field is reachable only as `CATEGORY1`. **Verifies the replace**: after a replacing write it re-reads the row count and warns if it differs from what was sent — a subform PUT is documented to replace, and if it ever appended the deal would silently show double the estimate while the call still reported success. **Overwrites only when asked**: the deal is read first, and by default any existing rows/description are left alone with a warning, since a subform write replaces every row and sales may have typed their own. That default made the price **write-once** — `Amount` is derived from the rows, so an edited estimate could never reprice a deal that already had any — which is why the send dialog (and only the send dialog) passes **`replace=1`**, after showing the deal's live amount and row count. Import, the status changer and mark-complete keep the safe default. The free-text `Description` is narrower still: `replace` rewrites it only when this app wrote it (`isGeneratedDescription`, matching the `Estimate: … line item…` roll-up) — a rep's own notes are never deleted. Can't resolve the subform → skips, warns, and the products still ride in the Description |
| **Stage picklist** | `/api/zoho/deal-stages` | The org's own Deal `Stage` list (value + pipeline order + forecast bucket + probability), read via `ZohoCRM.settings.READ` and cached 30 min in `lib/zoho/stages.ts`. **One reader, deliberately**: the status changer offers exactly what the push route accepts, so the menu can never show a stage the server then rejects. ⚠️ The readable bucket is **`forecast_type`** ("Open" / "Closed Won" / "Closed Lost"). `forecast_category` looks right and is **an opaque id** — matching on it classifies every stage as not-won |
| **In-app status changer** (write) | via the push route | The stage badge on the editor's Setup panel is a dropdown (`ZohoStageSelect`): pick any stage in the org pipeline and the deal moves, without opening Zoho. **All stages, revenue ones included** — a stage is reversible in Zoho, and the irreversible half (the PO) has its own gate. No confirm dialog; the result is toasted |
| **Push to Zoho** (write) | `POST /api/zoho/deals/[id]/push` | The app's only writes: **two explicit buttons plus one on import**. **Import / link a deal** → **"Discovery"**, no attachment. **Quote editor → "Send to Zoho"**: also **"Discovery"** — a finished estimate means scoping is done, and sales walks the deal up the pipeline from there. The PDF is attached and the Packages rows filled either way. **Project page → "Mark complete in Zoho"** (only once the project is `completed`): Deal → **"Project Completed"**, no attachment. Gated by `requireZohoWriter()`. **Any stage in the org picklist is settable** (the status changer above); the guard is that it must EXIST — validated against `lib/zoho/stages.ts` before the request leaves the process, not a hardcoded list. **`Stage` is the only plain field written** — `Quote_number` is a system *autonumber*, and `Amount` **reports itself writable but is not**: a write returns SUCCESS, reads back correctly, then Zoho recomputes it from the **Packages subform** within seconds (verified live — 43,833 reverted to the subform's 20,000 in under 4 s). So the estimate's price travels as a priced Packages row, never as an `Amount` write. **Idempotent against the LIVE deal**: the route reads the deal's current stage before writing and skips the PUT when it is already there (`stageAlreadySet`). That replaced replaying the quote's own `pushes` history, which blocked two legitimate things — a status changer moving A→B→A, and re-attaching an edited estimate's PDF to a deal already at Proposal Sent. **Forward-only for side-effect stages**: a push carries `explicit=1` only when a human picked the stage from the in-app status changer — that may move a deal anywhere, backwards included. Everything else is a side effect and may only move a deal FORWARD, judged by the org's own `sequence_number` (`stageOrder`), not a static list. This matters most for "Send to Zoho", which sets *Discovery*: on a deal sales had already moved to Negotiation or Closed Won, that would silently drag it back to the start of the pipeline in order to re-attach a PDF. Only the **stage** is held back — the PDF and Packages rows still go up, because losing those would be the worse bug. `AUTO_ADVANCE_FROM` additionally pins the import's Discovery advance to `Proposal Requested`. `proposals.zoho.pushes` (`stage → timestamp`) is still recorded — the sibling guard and the badge read it — but no longer gates a re-push. **Attachments are deduped separately, by filename** (`proposals.zoho.attachments`, `filename → timestamp`, via `shouldAttach()`): the PDF now goes up at whichever stage a deal is opened at, so "was this stage pushed?" is no longer the right question. `proposalPdfFilename` embeds the estimate's date, so re-sending an unchanged quote is skipped while an estimate edited later attaches its updated PDF. This matters because Zoho does **not** dedupe (same filename twice = two records) and there is no DELETE scope. Read it via `zohoPushes()`, which folds in the legacy `pushed_at`/`pushed_stage` fields. Every push (and every skip) records the live `stage` + `stage_synced_at`, which is what `ZohoStageBadge` renders on the Estimator list and the editor's Setup panel |

> ⚠️ **This org's pipeline order is not the obvious one.** Read live:
> Discovery (1, 25%) · Negotiation (2, 35%) · Proposal Requested (3, 45%) ·
> Proposal Sent (4, 50%) · Verbal Yes (5, 60%) · Proposal Signed (6, 90%) ·
> Closed Won (7, 100%) · Closed Lost (8, 0%) · Not at this time maybe later
> (9, 20%) · Project Completed (10, 0%). So the import's "Proposal Requested →
> Discovery" advance moves a deal *backwards* by Zoho's own ordering — it is
> deliberate (scoping starts there), which is why `AUTO_ADVANCE_FROM` encodes
> intent rather than being derived from `sequence_number`.

> Use **Accounts + Contacts** (~4.0k / ~3.7k qualified records) for client data — **not Leads**
> (~122k raw, full of test/spam rows). A Lead converts into Account + Contact (+ Deal).

> ⚠️ **One active estimate per deal** (`lib/zoho/deal-exclusivity.ts`). Two quotes
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

> ⚠️ **`proposals` has no realtime channel, on purpose.** The row is one JSONB
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

> ⚠️ **Adding any column to `proposals` means updating two whitelists** — `quoteUpdatePayload()`
> and the `Pick<ClientQuote, …>` param type of `updateProposal`. Miss either and the edit updates
> the store but **silently never persists**.

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

> ⚠️ Three things the PBS reference doc gets wrong, all verified live:
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
| **PO status refresh** (PBS → app) | `GET /api/pbs/pos?proposalIds=…` | The PBS→app direction, `usePbsPoRefresh`. Reads each linked PO with `fetchPoById` (`fetch-po` + `po_id`) and stores `status` / `missing` only when they changed. **Exact, so it applies automatically** — the id was recorded at creation, unlike the name-matching that keeps *linking* manual. Live history uses five status codes (B 440, C 27, N 19, A 8, E 6 of 500), so a PO does move after this app creates it. ⚠️ `fetch-po` **without** `po_id` answers HTTP 200 with 200 arbitrary POs (verified live) — same shape as a success; a not-found is an explicit `400 / "PO not found."`, which is why "gone" and "couldn't read" stay distinct. Only status code **N = New** is confirmed (from the PBS UI); the rest render as their raw letter rather than a guessed label |
| **Create PO** (write) | `POST /api/pbs/pos` | The only PBS write. Sends `name` + `client_id` + `project_template_id`; PBS generates the PO number. **Gated on the deal being won** — see below. **Refuses (409) when a candidate exists**, handing it back for a human to confirm; `linkExisting=<po_no>` then records the link and calls PBS not at all. A PBS read it can't complete returns 502 rather than proceeding — the quote's own `pbs` field is not proof a PO doesn't exist |

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

**The PO is a shell** — name, client, template. The API accepts nothing else:
`rate_per_hour` is pinned to `0.0000` server-side and there is no line-item or
amount field, so the estimate's figures stay in this app and in Zoho.

> ⚠️ **PBS has no delete endpoint.** A duplicate PO is a manual cleanup in a live
> billing system, so `POST /api/pbs/pos` refuses a quote that already has a
> `po_no`, claims the row with a compare-and-set (`pbs.creating_at`, 2-min TTL)
> before calling PBS, releases the claim on failure, and retries the link write
> once. **Adding a column to `proposals` means updating two whitelists** —
> `quoteUpdatePayload()` and the `Pick<ClientQuote, …>` on `updateProposal`.

**Default billing client:** `PBS_DEFAULT_CLIENT` (a three-letter **code**, default
`STR`) is used when an estimate has no client of its own. It's resolved against
live PO history, so an unknown code leaves the picker empty rather than failing at
create time. Precedence: the estimate's own client → the workspace default. It is
**not written to the quote** until a PO is actually created, so changing the env
changes future estimates without rewriting past ones.

**Storage:** `proposals.pbs` jsonb (migration `0031`) —
`{client_id, client_code, po_id, po_no, created_at, creating_at, adopted}`.

> ⚠️ **A PO is never linked on a name match alone.** PBS has no get-by-name, so
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
> ⚠️ **`rowToQuote` must map every jsonb column, and `pbs` was missing.** It was
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
can't complete returns 502 rather than creating a PO. An estimate with no Zoho
deal at all skips the check; there is nothing to gate on, and hand-made estimates
were billable before this rule existed. The Create PO dialog picks *where* it is filed, so the
choice and the act sit together.

---

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
| Notifications + activity feed  | `store/notifications-store.ts`             | `timeline-notifications`                  |
| Task board pane / active view  | tasks store (ephemeral slice)              | not persisted (`selectedTaskId`, `activeView`) |
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
| Read Zoho CRM data (deals/accounts/contacts) | Yes | Yes | No | No |
| Connect / disconnect Zoho CRM | Yes | No | No | No |

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

   **A strip that scrolls sideways reads as a strip that ends.** Overlay
   scrollbars are invisible on touch and idle desktops, so tabs and filter pills
   that overflow hide their last items with no hint — the estimator's *Review*
   tab (where Send to Zoho lives) sat off a 375px screen exactly this way.
   Prefer `flex-wrap` under `sm:` over `overflow-x-auto`, and never pair
   overflow with `[scrollbar-width:none]`. Reserve scrolling for content that
   genuinely cannot wrap (Gantt, wide tables) — those get their own container.

   So gate multi-column grids on **`lg:`**, not `sm:`/`md:` — `sm:grid-cols-3` fires at 640px but the
   *content area* on a tablet is far narrower than the viewport suggests.

6. **Confirm before destroy.** Every delete, archive, or destructive action needs a
   ConfirmDialog that names exactly what will be affected.

7. **Security is not optional.** httpOnly cookies, DOMPurify on user content, Zod on all
   inputs. No exceptions, even for "internal" features.

8. **One definition per number, shared.** Reports, Workload and the Dashboard each
   hand-rolled the same date maths and disagreed on screen: `new Date(due_date) < now`
   treats a DATE column as midnight **UTC**, so a task due *today* counted as overdue
   from 08:00 local (and from the previous evening in a negative-offset zone) — Reports
   said 7 overdue where 6 were late while the Dashboard called the same task "Today".
   Use `lib/utils/relative-dates.ts` (`daysUntil` / `isOverdue` / `relativeDay`, built on
   date-fns `parseISO` + `differenceInCalendarDays`), never a fresh comparison.
   Same rule for hours: **per-person** time comes from `time_entries` (one row per
   logger); `tasks.logged_hours` is the TASK's cached total and credits every assignee
   in full, so summing it per member double-counts shared work.

---

## How To Use This File With Claude

When working inside this project with Claude, you can say things like:

- **"Using the patterns in CLAUDE.md, help me build the task creation form"**
- **"Following the API layer pattern, write the useProjects hook"**
- **"Create the EmptyState component for the tasks board"**
- **"Scaffold the /projects/[projectId]/tasks page with loading, error, and empty states"**
- **"Write the Axios interceptor setup from scratch following this project's auth flow"**
- **"Add the Kanban board drag-and-drop using @dnd-kit as described in the stack"**

Claude will use this file as full project context so every response fits the architecture,
naming conventions, and patterns already established here.

> **2026-08-28 — billing moved behind the win.** Creating the PBS PO left "Send to
> Zoho" and became its own **Create PO** button + dialog, shown only once the deal
> is won (Zoho forecast bucket, re-checked live server-side, fails closed). The
> stage badge became an **in-app status changer** over the org's real picklist
> (`/api/zoho/deal-stages`), so the push route validates against that list instead
> of a hardcoded whitelist, and idempotency now comes from the deal's live stage
> rather than this app's own push history.
>
> Last updated: 2026-07-14 — **Discovery + Proposals merged into one Estimator** (guided questionnaire
> *or* catalog → one quote; `proposals.discovery` JSONB; `/discovery` redirects). Also since 2026-07-01:
> invite-only onboarding + pending state, two-tier user offboarding (deactivate / hard-delete), and the
> sales→delivery workflow (proposal approval → project, task-assignment accept/reject/pass, `time_entries`,
> personal vs team Workload). Supabase remains wired via the synced-store bridge with the demo fallback.
> Maintainer: Frontend Dev
> Update this file whenever the project scope, stack, or patterns change.
