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
| 3     | Proposals, Gantt Charts, Pricing | **Wired** — proposal estimator (v2 catalog/tier/add-ons) live; Gantt/Timeline + PDF/Excel export (client-side, unchanged) |
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
│   ├── proposals/                             # proposal estimator (coordinator quotes)
│   │   └── [proposalId]/                      # editor: catalog, line items, add-ons, PDF/Excel export
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
│   ├── proposals/      # Estimator: editor, CatalogBrowser, AddonsCard, PDF preview mock, access-denied
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
├── activity/           # workspace-push (append activity/notifications)
├── collaboration/      # notify-task-activity
├── undo/               # offer-undo-toast (one-shot Undo)
└── supabase/           # client.ts (browser), server.ts (RSC seam), middleware.ts + config.ts + parse-error.ts — wired
store/                  # Zustand (live via WorkspaceSync + optimistic write-through; demo persists to localStorage):
                        #   projects, sprints, tasks, auth, team, availability, activity,
                        #   notifications, weekly-capacity, proposal-estimator
types/                  # project, sprint, task, proposal, availability, database (generated — `npm run db:types`)
docs/                   # data-mapping.md (data shapes) + backend-supabase.md + supabase-integration-plan.md
supabase/               # migrations/ (0001 schema, 0002 rls, 0003–0009 mentions/realtime/activity/storage/role-guard) + README — `npm run db:push`
project-csv/            # "tasks and integration.xlsx" — source for the proposal catalog
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
3. Root `proxy.ts` refreshes the session cookie on every request.
4. RLS uses `auth.uid()` to scope every query automatically; on missing session, gate in middleware/UI.

**To go live:**

- Create a Supabase project; put URL + keys in `.env.local` (see `.env.example`).
- `npm run db:push` to apply `supabase/migrations/`, then `npm run db:types` to regenerate `types/database.types.ts`.
- Swap each Zustand store for Supabase queries behind its existing `hooks/` (the seam that keeps this a contained change).
- Keep `usePermissions()` in lockstep with the RLS policies in `0002_rls.sql`.

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

**Why TanStack Query + Zustand (not Redux)?**
TanStack Query is the recommended cache/dedupe layer over Supabase queries (server state); Zustand
holds only UI state (modals, board view). Keeping them separate is cleaner and faster. (TanStack
is not installed yet — it lands with backend integration.)

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
| `tasks` (+ `task_assignees`)          | select / insert / update / delete + Realtime | `tasks-store` / `useTasks` | Wired |
| `task_comments` (+ `comment_reactions`)| select / insert / update / delete + Realtime | `tasks-store` / `TaskCommentSection` | Wired |
| `profiles` (team directory)           | select                     | `team-store` / `useTeamMembers` | Wired |
| `notifications`                       | select / insert / update / delete + Realtime | `notifications-store` | Wired |
| `activity` (workspace log)            | select / insert + Realtime | `activity-store`            | Wired |
| `availability_entries`                | select / insert / update / delete | `availability-store` (calendar/workload) | Wired |
| `weekly_capacity`                     | select / upsert            | `weekly-capacity-store` (workload) | Wired |
| `proposals` (jsonb document)          | select / insert / update / delete | `proposal-estimator-store` | Wired |
| Storage `avatars` bucket              | upload / getPublicUrl      | `ProfileForm` → `profiles.avatar_url` | Wired |

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
  project_id?: string | null; // optional → projects.id
  client_name?: string;
  platform: ProposalPlatform;
  line_items: ProposalLineItem[]; // JSONB in the proposals table
  addons: ProposalAddons;         // JSONB roll-up (PM/responsive/design/QA)
  requirements_unclear: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## Proposal estimator (workflow coordinators)

**Purpose:** A **separate coordinator-facing tool** to build **client quotes** from a structured list of work—not the same UX as the day-to-day sprint board (line items estimate and sell work; linking rows to real `Task` records later is optional, not required for v1).

> **The estimator evolved past the original 4-tier model.** What's described below is the
> current **v2** implementation (see `types/proposal.types.ts`, `lib/constants/proposal-estimator.ts`,
> `lib/proposal-catalog/`). The old "Easy/Medium/Complex/Very complex = fixed hours" design is gone.

**Flow (v2)**

1. Open or create a **quote** (`ClientQuote`: title, optional `project_id`, client name, notes).
2. Pick a **platform** — WordPress, Shopify, Wix, Squarespace, Custom PHP/HTML/CSS, Custom React/Next, or "Other / blank slate". Each platform (except blank) has a baked **catalog** of work items.
3. Add **line items**, either by importing **catalog rows** (`CatalogBrowser`, grouped by module) or as freehand lines. Each line carries `base_hours`, a **tier**, a **quantity**, and optional `depends_on` references.
4. **Tier** is a multiplier on base hours, not a fixed lookup: **Basic = 1×, Advanced = 1.5×, Custom = 2×** (`TIER_MULTIPLIERS`). Line hours = `base_hours × tierMultiplier × quantity`.
5. **Roll-up add-ons** apply globally on top of dev hours, compounding in order (`computeQuoteTotals`):
   `responsive = dev × pct` → `design = (dev+responsive) × pct` → `qa = (…) × pct` → `pm = (…) × pct`.
   Defaults: PM 10%, Responsive 25%, Design 35%, QA 20% (each toggleable — `DEFAULT_ADDONS`).
6. Totals show dev / responsive / design / qa / pm / **grand total** hours.
7. **Output:** in-browser **PDF preview mock** plus real **PDF export** (jsPDF) and **Excel export** (xlsx) — see `lib/utils/proposal-pdf-export.ts` and `proposal-excel-export.ts`. The `GET /proposals/:id/export` endpoint is still the eventual server-side path.

**Catalog source:** `lib/proposal-catalog/catalog.json`, generated from `project-csv/tasks and integration.xlsx`. Frontend-only; replace with API when published.

**Frontend-only (current):** `store/proposal-estimator-store.ts` is Zustand + persist (`timeline-proposal-estimator`). At integration, this maps to the `proposals` table (`line_items` + `addons` as JSONB — see `supabase/migrations/0001_init.sql`).

**Permissions:** Same matrix as **Export proposals** — **Admin** and **Manager** only. **Member** and **Viewer** must not see primary entry points or mutating controls. Gate with **`canExportProposals`** from `usePermissions()` so UI stays aligned with the permissions table below.

**Backend (later):** the `proposals` table + RLS already exist in `supabase/migrations/`. Optional server-side export is a Supabase Edge Function → Storage bucket; the client-side jsPDF/xlsx export works today.

---

## State Management Map

> All persisted stores use Zustand `persist` → `localStorage` (keys prefixed `timeline-`;
> see [docs/data-mapping.md](docs/data-mapping.md) for the full key list). At integration these
> stores are replaced by Supabase queries (TanStack Query as the cache layer) — Zustand keeps
> only true UI state. Not wired yet.

| State                          | Lives In                                  | Persist key / note                       |
| ------------------------------ | ----------------------------------------- | ---------------------------------------- |
| User session + role (demo)     | `store/auth-store.ts`                      | `timeline-auth` (demo user; no cookie yet) |
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
| Manage team      | Yes   | No      | No     | No     |
| View all content | Yes   | Yes     | Yes    | Yes    |
| Export proposals | Yes   | Yes     | No     | No     |
| Proposal estimator (client quotes) | Yes | Yes | No | No |
| Edit others' PTO/availability | Yes | Yes | No | No |

> **Proposal estimator** uses the same gates as **Export proposals** — use `canExportProposals` in the UI.
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

### Data Access Pattern (Supabase + TanStack Query)

> Today the hooks read/write Zustand stores (demo). At integration, swap the hook body for a
> Supabase query — the component layer never changes. See [docs/backend-supabase.md](docs/backend-supabase.md)
> for the full version. The current demo runs without TanStack Query (it lands with this swap).

```ts
// 1. Types come from the generated schema (types/database.types.ts) after `npm run db:types`.
interface CreateTaskPayload {
  title: string;
  project_id: string;
  due_date?: string;
}

// 2. Custom hook in hooks/useTasks.ts — Supabase via @supabase/ssr client
export const useCreateTask = () => {
  const supabase = createClient(); // lib/supabase/client.ts
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (error) throw error; // RLS denial / network → onError
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.tasks.byProject(variables.project_id),
      });
      toast.success("Task created");
    },
    onError: (error) => {
      toast.error(error.message); // Postgres/RLS error message
    },
  });
};

// 3. Component just calls the hook
const { mutate: createTask, isPending } = useCreateTask();
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
   Gantt/Calendar fallback to list view on mobile.

6. **Confirm before destroy.** Every delete, archive, or destructive action needs a
   ConfirmDialog that names exactly what will be affected.

7. **Security is not optional.** httpOnly cookies, DOMPurify on user content, Zod on all
   inputs. No exceptions, even for "internal" features.

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

> Last updated: 2026-07-01 — Supabase integration wired (Auth, data, Realtime, Storage, RLS) via the
> synced-store bridge, with the Zustand/localStorage demo kept as a fallback behind `isSupabaseConfigured`.
> Maintainer: Frontend Dev
> Update this file whenever the project scope, stack, or patterns change.
