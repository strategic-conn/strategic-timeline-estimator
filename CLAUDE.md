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

**My role:** Frontend only (Next.js). The backend is a **Laravel REST API** built by a
separate backend developer who exposes endpoints I consume.

**Development approach:** AI-assisted with Cursor. Aim for clean, production-grade code —
not just fast code.

---

## Current Status

| Phase | Description                      | Status      |
| ----- | -------------------------------- | ----------- |
| 1     | Auth, Projects/Workspaces, Tasks | Not started |
| 2     | Collaboration, Scheduling, PTO   | Not started |
| 3     | Proposals, Gantt Charts, Pricing | Not started |
| 4     | Integrations, Performance, WCAG  | Not started |

> Update this table when a phase starts or completes.

**Total estimated FE hours (AI-assisted): ~232 hours**

---

## Tech Stack (Frontend)

This repo’s `AGENTS.md` notes that **Next.js behavior/conventions may differ** from typical docs.
When unsure, check `node_modules/next/dist/docs/` in this project before implementing.

### Installed (current)

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Framework | Next.js 16.2.1 (App Router)      |
| UI        | React 19.2.4                     |
| Language  | TypeScript                       |
| Styling   | Tailwind CSS 4                   |
| UI kit    | shadcn/ui (generated components) |
| Icons     | lucide-react                     |

### Planned / to be added as needed

| Layer        | Technology                   |
| ------------ | ---------------------------- |
| Server State | TanStack Query (React Query) |
| UI State     | Zustand                      |
| Forms        | React Hook Form + Zod        |
| HTTP Client  | Axios (centralized instance) |

---

## Project Structure

```
app/
├── (auth)/                                    # login, register, forgot-password
├── (dashboard)/                               # all protected pages
│   ├── dashboard/page.tsx                     # KPI cards, due-soon, activity
│   ├── projects/
│   │   ├── page.tsx                           # project list
│   │   └── [projectId]/
│   │       ├── page.tsx                       # project overview — sprint list + backlog
│   │       ├── sprints/[sprintId]/page.tsx    # sprint task board (kanban/list/table)
│   │       ├── backlog/page.tsx               # tasks not in any sprint
│   │       └── tasks/page.tsx                 # legacy redirect → project overview
│   ├── calendar/
│   ├── reports/
│   ├── proposals/                             # proposal estimator (coordinator quotes), PDF preview mock
│   ├── team/
│   └── settings/
├── api/auth/                                  # Next.js BFF routes
├── layout.tsx
└── page.tsx
components/
├── ui/                 # shadcn/ui — generated components; avoid manual edits
├── common/             # DataTable, PageHeader, EmptyState, HelpTip
├── features/
│   ├── projects/       # ProjectsPage, ProjectCard, Create/Edit/Delete modals
│   ├── proposals/      # Proposal estimator: line items, complexity → hours, PDF preview mock
│   ├── sprints/        # ProjectOverviewPage, SprintCard, Create/Edit/Delete modals
│   └── tasks/          # TasksPage, KanbanBoard, TaskCard, TaskDetailDrawer, modals
└── layouts/            # DashboardHeader, Sidebar, MobileNav, MobileTabBar
hooks/                  # useProjects, useSprints, useTasks, useAuth, usePermissions
lib/
├── api/                # axios.ts + per-feature API call files
├── utils/              # cn, date, format, work-hours helpers
├── validations/        # Zod schemas per feature
├── dummy/              # dummy data for projects, sprints, tasks, team
└── constants/          # projects.ts, sprints.ts, query-keys, config
store/                  # Zustand: projects-store, sprints-store, auth, ui, notification
types/                  # project.types, sprint.types, task.types, api.types, ui.types
```

---

## How the Backend Relationship Works

The backend developer builds and maintains the Laravel REST API. I consume it from Next.js.

**API base URL:** `process.env.NEXT_PUBLIC_API_URL` (example: `http://localhost:8000/api/v1`)

**Auth flow (cookie-based):**

1. User signs in via a Next.js route handler (BFF) or direct API call (depending on backend contract)
2. Backend establishes session via **httpOnly cookies** (and CSRF protection if using Sanctum)
3. Frontend requests authenticate via cookies (`withCredentials`); **no token is stored in local/session storage**
4. On 401, show a re-auth flow (optionally attempt a refresh endpoint once if the backend supports it)

**I need from the backend developer:**

- Postman collection or OpenAPI spec before starting each phase
- CORS configured to allow my frontend domain
- Consistent error format: `{ message: string, errors: { field: string[] } }`
- Consistent pagination: `{ data: T[], meta: { total, per_page, current_page, last_page } }`

---

## Key Architectural Decisions

**Why Next.js App Router (not plain React)?**
Route-based layouts, middleware for auth guards, server components for lightweight rendering,
API routes as BFF for secure cookie handling. This is the right call for a dashboard SaaS.

**Why TanStack Query + Zustand (not Redux)?**
TanStack Query handles all server state (fetching, caching, revalidation). Zustand handles
only UI state (sidebar open, modal state, theme). Keeping them separate is cleaner and faster.

**Why httpOnly cookies (not localStorage)?**
localStorage is readable by any JS — vulnerable to XSS. httpOnly cookies are inaccessible
to JavaScript, making token theft via XSS attacks impossible.

**Why Zod for validation?**
Zod schemas serve dual purpose: TypeScript type inference AND runtime validation. One schema
gives you both the type and the validator. Works seamlessly with React Hook Form.

---

## API Endpoint Map

> Update this as endpoints are built and integrated.
> Status: Pending | Ready | Integrated

| Method | Endpoint                        | Status  | Hook             |
| ------ | ------------------------------- | ------- | ---------------- |
| POST   | /auth/login                     | Pending | useAuth          |
| POST   | /auth/logout                    | Pending | useAuth          |
| GET    | /auth/me                        | Pending | useAuth          |
| GET    | /projects                       | Pending | useProjects      |
| POST   | /projects                       | Pending | useProjects      |
| GET    | /projects/:id                   | Pending | useProject       |
| PUT    | /projects/:id                   | Pending | useProject       |
| DELETE | /projects/:id                   | Pending | useProject       |
| GET    | /projects/:id/sprints           | Pending | useSprints       |
| POST   | /projects/:id/sprints           | Pending | useSprints       |
| GET    | /sprints/:id                    | Pending | useSprint        |
| PUT    | /sprints/:id                    | Pending | useSprint        |
| DELETE | /sprints/:id                    | Pending | useSprint        |
| GET    | /sprints/:id/tasks              | Pending | useTasks         |
| GET    | /projects/:id/backlog           | Pending | useTasks         |
| POST   | /tasks                          | Pending | useTasks         |
| PUT    | /tasks/:id                      | Pending | useTask          |
| DELETE | /tasks/:id                      | Pending | useTask          |
| GET    | /users/team                     | Pending | useTeam          |
| GET    | /notifications                  | Pending | useNotifications |
| GET    | /calendar/events                | Pending | useCalendar      |
| POST   | /proposals                      | Pending | useProposals     |
| GET    | /proposals/:id/export           | Pending | useProposals     |

---

## Data Models

> Keep these in sync with `types/*.types.ts`. Update as models evolve.

**Hierarchy:** Project → Sprint → Task (tasks without a sprint live in the backlog)

```ts
// Core entities — abbreviated for context

interface User {
  id: number;
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
  owner_id: number;
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
  assignee_ids: number[];
  reporter_id: number;
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

interface Proposal {
  id: number;
  project_id: number;
  title: string;
  content: object;
  status: "draft" | "sent" | "approved";
  created_at: string;
}
```

---

## Proposal estimator (workflow coordinators)

**Purpose:** A **separate coordinator-facing tool** to build **client quotes** from a structured list of work—not the same UX as the day-to-day sprint board (line items estimate and sell work; linking rows to real `Task` records later is optional, not required for v1).

**Flow**

1. Open or create a **proposal / quote** (title, client or project context, optional notes).
2. Add **line items**: short description per row.
3. Assign each line a **complexity** from a **fixed preset** set (product-default labels such as *Easy*, *Medium*, *Complex*, *Very complex* — labels are tunable; the tier set is small and global for the demo).
4. Each tier maps to **single fixed default hours** via one **global lookup table** (e.g. Easy = 2h, Medium = 4h — constants in frontend until the API owns configuration).
5. Show **rolled-up totals** (hours; optional rate × hours when **Pricing** lands in Phase 3).
6. **Output:** **PDF preview mock** in the browser (print-styled layout + live form data). Real export uses **`GET /proposals/:id/export`** when integrated.

**Frontend-only (current):** Implement with **Zustand + persist** (or the same demo pattern as other stores). **Do not invent** Laravel payloads for line items until the backend publishes OpenAPI/Postman.

**Permissions:** Same matrix as **Export proposals** — **Admin** and **Manager** only. **Member** and **Viewer** must not see primary entry points or mutating controls. Gate with **`canExportProposals`** from `usePermissions()` so UI stays aligned with the permissions table below.

**Backend (later):** Requirements analysis, schema for proposals + line items, and server-side generation remain with the Laravel developer; extend the API map when contracts exist.

---

## State Management Map

| State                     | Lives In                         | Reason                            |
| ------------------------- | -------------------------------- | --------------------------------- |
| User session + role       | auth.store (Zustand)             | Client-side, persisted via cookie |
| Projects list             | projects-store (Zustand / demo)  | Demo: local. Prod: TanStack Query |
| Sprints list              | sprints-store (Zustand / demo)   | Demo: local. Prod: TanStack Query |
| Tasks for a sprint        | useTasks (useState / demo)       | Demo: local. Prod: TanStack Query |
| Task timers               | useTaskTimerStore (Zustand)      | Ephemeral session state           |
| Sidebar open/closed       | ui.store (Zustand)               | Pure UI state                     |
| Active modal              | ui.store (Zustand)               | Pure UI state                     |
| Notification unread count | notification.store               | Client-side counter               |
| Notification list         | TanStack Query                   | Server data                       |
| Theme (light/dark)        | ui.store (Zustand)               | Client preference                 |

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

> **Proposal estimator** uses the same gates as **Export proposals** — use `canExportProposals` in the UI.
>
> Permissions are enforced by the backend. The UI uses `usePermissions()` to show/hide controls.
> VIEWER role: action buttons are hidden entirely, not just disabled.

---

## Environment Variables

```env
# .env.local — never commit this file
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=Timeline Estimator
NEXT_PUBLIC_APP_ENV=development
```

---

## Coding Patterns I Follow

### API Call Pattern

```ts
// 1. Define types
interface CreateTaskPayload {
  title: string;
  project_id: number;
  due_date?: string;
}
interface TaskResponse {
  data: Task;
  message: string;
}

// 2. API function in lib/api/tasks.api.ts
export const createTask = (payload: CreateTaskPayload): Promise<TaskResponse> =>
  axios.post("/tasks", payload).then((res) => res.data);

// 3. Custom hook in hooks/useTasks.ts
export const useCreateTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.tasks.byProject(variables.project_id),
      });
      toast.success("Task created");
    },
    onError: (error) => {
      toast.error(parseApiError(error));
    },
  });
};

// 4. Component just calls the hook
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

1. **Complete the data layer first.** Define types → write API function → write hook → build UI.
   Never scaffold a UI component before the hook exists.

2. **Never skip three states.** Every data-fetching component needs: loading skeleton, error
   message, and empty state. If any of these are missing, the feature is not done.

3. **Ask the backend dev before assuming.** If an endpoint isn't documented, ask.
   Never guess the request/response shape — it causes bugs that are hard to trace.

4. **Optimistic updates on drag-drop and status changes.** These interactions feel broken
   if they wait for a server round-trip. Update UI instantly, sync to server in background.

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

> Last updated: 2026-04-04
> Maintainer: Frontend Dev
> Update this file whenever the project scope, stack, or patterns change.
