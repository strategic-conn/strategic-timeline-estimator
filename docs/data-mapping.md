# Data mapping & schema (application model)

This document describes the application data model (TypeScript types in `types/`, Zustand stores in `store/`).

> **Status: wired to Supabase (with a demo fallback).** When `NEXT_PUBLIC_SUPABASE_*` env vars are set,
> stores hydrate from and write to live Supabase (schema/RLS in `supabase/migrations/`, see
> [backend-supabase.md](backend-supabase.md)) via the synced-store bridge. With no env vars, the app
> falls back to Zustand + `localStorage` + `DUMMY_*` seeds. The switch is `isSupabaseConfigured`.
>
> **Staleness caveats vs. the tables below** (the field listings are demo-era; the authoritative
> shape is `types/*.types.ts` + generated `types/database.types.ts`):
> - **Person ids are `string` (UUID)**, not `number` — `TeamMember.id`, `owner_id`, `reporter_id`,
>   `assignee_ids[]`, `AvailabilityEntry.user_id`, comment/reply `author_id`, reaction `userIds`, and
>   weekly-capacity keys all flipped to `string`. Demo mode uses `"1".."6"`.
> - Some author/owner ids are now **nullable** (`string | null`): offboarding a user hard-deletes them
>   and their authored/owned rows anonymise to `null` → rendered as **"Former member"** (`owner_id`,
>   `reporter_id`, comment/reply `author_id`).
> - **`TeamMember`** also carries `page_access?: string[] | null` (per-user page allowlist),
>   `deactivated_at?: string | null` (offboarded), and `confirmed_at?: string | null` (invite accepted;
>   `null` = invited, not yet joined).
> - **The Estimator merged Discovery + Proposals.** `ClientQuote` gained `platform`, `status`
>   (draft/sent/approved/rejected), roll-up `addons`, `requirements_unclear`, and **`discovery`**
>   (the guided questionnaire answers). `ProposalLineItem` is the v2 shape (`base_hours` × tier × `quantity`),
>   **not** the old `complexity`/`hours` — both are corrected in the tables below. The old
>   `discovery_projects` table was merged into `proposals.discovery` and dropped.
> - **Tasks:** `task_assignees` rows carry a `status` (pending/accepted/rejected/passed) + `assigned_by`;
>   hours are attributed per-session in **`time_entries`** (only accepted assignees log). Notifications and
>   the workspace activity log are **separate** stores (`notifications-store` / `activity-store`).

---

## Persistence keys (localStorage)

Demo mode persists full state to these keys. **In live mode each store `partialize`s to empty** (data
is the source-of-truth in Supabase and re-fetched on load), so stale localStorage never shadows live data.

| Persist key                   | Store / area                   | Version |
| ----------------------------- | ------------------------------ | ------- |
| `timeline-projects`           | Projects                       | 2       |
| `timeline-sprints`            | Sprints                        | 2       |
| `timeline-tasks`              | Tasks (incl. nested comments)  | 2       |
| `timeline-notifications`      | Notifications (personal bell)  | 1       |
| `timeline-activity`           | Workspace activity feed        | 1       |
| `timeline-proposal-estimator` | Estimator quotes (line items + addons + discovery) | 4       |
| `timeline-availability`       | PTO / availability entries     | 2       |
| `timeline-weekly-capacity`    | Per–team-member hour overrides | 2       |
| `timeline-auth`               | Signed-in user profile (demo mirror) | 1 |

**Not persisted** (in-memory only): the team directory (`team-store`, hydrated live/from `TEAM_MEMBERS`),
task board UI (`selectedTaskId`, `activeView`), task timers (`useTaskTimerStore`), most page filter state.

---

## Entity relationships (logical)

| Parent                  | Child                  | Link field(s)                                                              | Cardinality           |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------- | --------------------- |
| Project                 | Sprint                 | `Sprint.project_id` → `Project.id`                                         | 1 : N                 |
| Project                 | Task                   | `Task.project_id` → `Project.id`                                           | 1 : N                 |
| Sprint                  | Task                   | `Task.sprint_id` → `Sprint.id`; `null`/omit = **backlog** for that project | 1 : N                 |
| Project                 | ClientQuote (proposal) | optional `ClientQuote.project_id` → `Project.id`                           | 1 : N (optional)      |
| Task                    | Comment                | `Task.comments[]`                                                          | 1 : N (embedded)      |
| Comment                 | Reply                  | `Comment.replies[]`                                                        | 1 : N (embedded)      |
| Team member (reference) | Task                   | `Task.assignee_ids[]`, `Task.reporter_id` → `TeamMember.id` (number)       | N : M / 1             |
| Team member (reference) | Availability           | `AvailabilityEntry.user_id` → `TeamMember.id`                              | 1 : N                 |
| Team member (reference) | Weekly capacity        | `WeeklyCapacityStore.overrides` keyed by `"${memberId}"`                   | 1 : 1 override per id |
| Auth user               | —                      | `AuthUser` is single demo user; unrelated ids to tasks by convention       | 1                     |
| AppNotification         | Project (optional)     | `AppNotification.project_id`                                               | N : 1 (optional)      |

**Reference data:** `TEAM_MEMBERS` in `lib/dummy/tasks.data.ts` supplies `TeamMember` rows used across tasks, calendar, workload—not a separate persisted store.

---

## Tables (fields per entity)

### Project (`types/project.types.ts`)

| Column      | Type                                    | Notes                     |
| ----------- | --------------------------------------- | ------------------------- |
| id          | string                                  | e.g. `proj-1`             |
| name        | string                                  |                           |
| description | string?                                 | optional                  |
| status      | `"active" \| "completed" \| "archived"` |                           |
| owner_id    | number                                  | FK-style → team member id |
| created_at  | string (ISO)                            |                           |
| updated_at  | string (ISO)                            |                           |

### Sprint (`types/sprint.types.ts`)

| Column     | Type                                                   | Notes                |
| ---------- | ------------------------------------------------------ | -------------------- |
| id         | string                                                 | e.g. `sprint-1`      |
| project_id | string                                                 | → Project.id         |
| name       | string                                                 |                      |
| goal       | string?                                                | optional             |
| status     | `"planning" \| "active" \| "completed" \| "cancelled"` |                      |
| start_date | string                                                 |                      |
| end_date   | string                                                 |                      |
| position   | number                                                 | order within project |
| created_at | string (ISO)                                           |                      |
| updated_at | string (ISO)                                           |                      |

### Task (`types/task.types.ts`)

| Column          | Type                        | Notes                                       |
| --------------- | --------------------------- | ------------------------------------------- |
| id              | string                      | e.g. `T-001`                                |
| title           | string                      |                                             |
| description     | string?                     | optional                                    |
| status          | `TaskStatus`                | todo, in_progress, in_review, done, blocked |
| priority        | `TaskPriority`              | low, medium, high, critical                 |
| assignee_ids    | number[]                    | many; team member ids                       |
| reporter_id     | number                      | team member id                              |
| project_id      | string                      | → Project.id                                |
| sprint_id       | string \| null \| undefined | **backlog** when null/undefined             |
| due_date        | string?                     | optional                                    |
| estimated_hours | number?                     | optional                                    |
| logged_hours    | number?                     | optional                                    |
| tags            | string[]                    |                                             |
| position        | number                      | order within Kanban column                  |
| created_at      | string (ISO)                |                                             |
| updated_at      | string (ISO)                |                                             |
| comments        | Comment[]                   | nested                                      |

### Comment

| Column     | Type         | Notes          |
| ---------- | ------------ | -------------- |
| id         | string       |                |
| author_id  | number       | team member id |
| body       | string       |                |
| created_at | string (ISO) |                |
| reactions  | Reaction[]   |                |
| replies    | Reply[]      |                |

### Reaction

| Column  | Type     | Notes |
| ------- | -------- | ----- |
| emoji   | string   |       |
| userIds | number[] |       |

### Reply

| Column     | Type         | Notes    |
| ---------- | ------------ | -------- |
| id         | string       |          |
| author_id  | number       |          |
| body       | string       |          |
| created_at | string (ISO) |          |
| mentions   | number[]     | user ids |

### TeamMember (`types/task.types.ts` — reference shape; live = `profiles`, demo = `TEAM_MEMBERS`)

| Column         | Type                                           | Notes                                        |
| -------------- | ---------------------------------------------- | -------------------------------------------- |
| id             | string                                         | UUID live; demo `"1".."6"`                   |
| name           | string                                         |                                              |
| email          | string                                         |                                              |
| role           | `"admin" \| "manager" \| "member" \| "viewer"` |                                              |
| avatar_url     | string                                         |                                              |
| initials       | string                                         |                                              |
| avatarColor    | string                                         |                                              |
| page_access    | string[] \| null?                              | per-user page allowlist; null = role default |
| deactivated_at | string \| null?                                | offboarded (banned); null = active           |
| confirmed_at   | string \| null?                                | invite accepted; null = invited, not joined  |

### ClientQuote (`types/proposal.types.ts`) — the Estimator document

| Column              | Type                             | Notes                                             |
| ------------------- | -------------------------------- | ------------------------------------------------- |
| id                  | string                           | e.g. `quote-1` (demo) / UUID (live)               |
| title               | string                           |                                                   |
| project_id          | string \| null \| undefined      | optional → Project (set on Start project)         |
| client_name         | string?                          | optional                                          |
| notes               | string?                          | optional                                          |
| platform            | ProposalPlatform                 | wordpress / shopify / wix / squarespace / php / react_next / custom |
| status              | `"draft" \| "sent" \| "approved" \| "rejected"` | approval lifecycle                 |
| line_items          | ProposalLineItem[]               | JSONB in `proposals`                              |
| addons              | ProposalAddons                   | roll-up PM / responsive / design / QA (JSONB)     |
| requirements_unclear| boolean                          | prices every line as Advanced when true           |
| discovery           | DiscoveryProject \| null         | guided questionnaire answers (JSONB); null = catalog/manual |
| created_at          | string (ISO)                     |                                                   |
| updated_at          | string (ISO)                     |                                                   |

### ProposalLineItem

| Column      | Type                                  | Notes                                             |
| ----------- | ------------------------------------- | ------------------------------------------------- |
| id          | string                                |                                                   |
| title       | string                                |                                                   |
| module      | string \| null                        | catalog module label (null = freehand)            |
| category_id | number \| null                        | catalog category                                  |
| catalog_id  | number \| null                        | source catalog row (null = freehand)              |
| base_hours  | number                                | per-unit hours before tier/quantity               |
| tier        | `"basic" \| "advanced" \| "custom"`   | multiplier 1× / 1.5× / 2×                          |
| quantity    | number                                |                                                   |
| hours       | number                                | computed = `base_hours × tierMult × quantity`     |
| depends_on  | string[]                              | ids of other line items this requires             |

### AvailabilityEntry (`types/availability.types.ts`)

| Column     | Type                                  | Notes                 |
| ---------- | ------------------------------------- | --------------------- |
| id         | string                                |                       |
| user_id    | number                                | → team member         |
| start_date | string                                | YYYY-MM-DD, inclusive |
| end_date   | string                                | YYYY-MM-DD, inclusive |
| kind       | `"pto" \| "unavailable" \| "partial"` |                       |
| note       | string?                               | optional              |
| created_at | string (ISO)                          |                       |
| updated_at | string (ISO)                          |                       |

### AppNotification (`store/notifications-store.ts`)

| Column     | Type                        | Notes                        |
| ---------- | --------------------------- | ---------------------------- |
| id         | string                      |                              |
| text       | string                      |                              |
| at         | string (ISO)                |                              |
| read       | boolean                     |                              |
| href       | string?                     | client route                 |
| project_id | string \| null \| undefined | optional filter for activity |

### AuthUser (`store/auth-store.ts`)

| Column     | Type                                           | Notes     |
| ---------- | ---------------------------------------------- | --------- |
| id         | number                                         | demo user |
| name       | string                                         |           |
| email      | string                                         |           |
| role       | `"admin" \| "manager" \| "member" \| "viewer"` |           |
| avatar_url | string?                                        | optional  |
| initials   | string                                         |           |

### Weekly capacity overrides (persisted slice)

| Shape     | Type                   | Notes                                                       |
| --------- | ---------------------- | ----------------------------------------------------------- |
| overrides | Record<string, number> | key = `String(memberId)`; value = hours/week, clamped 1–168 |

---

## Data flow (reads)

```
ProjectsStore.projects
    └→ SprintsStore.sprints (filter project_id)
    └→ TasksDataStore.tasks (filter project_id; sprint_idnull = backlog)
    └→ ProposalEstimatorStore.proposals (optional project_id)
    └→ AppNotification.project_id (filter activity)

TasksDataStore.tasks
    └→ TEAM_MEMBERS (resolve assignee / reporter labels)
    └→ push → NotificationsStore on comment/assign/etc. (writes)

WeeklyCapacityStore + TEAM_MEMBERS + tasks → Workload UI
AvailabilityStore.entries + TEAM_MEMBERS → Calendar / workload
AuthStore.user → settings / sidebar
```

Writes generally go to the owning store (`createTask` updates `timeline-tasks`, etc.). Notifications are appended when collaboration events occur (tasks store → notifications).

---

## JSON shapes (documents + relationships)

Minimal **examples** aligned with types (your API can mirror these objects).

### Project document

```json
{
  "id": "proj-1",
  "name": "Example",
  "description": "...",
  "status": "active",
  "owner_id": 1,
  "created_at": "2026-04-01T12:00:00.000Z",
  "updated_at": "2026-04-01T12:00:00.000Z"
}
```

### Sprint document

```json
{
  "id": "sprint-1",
  "project_id": "proj-1",
  "name": "Sprint 1",
  "goal": "...",
  "status": "active",
  "start_date": "2026-04-07",
  "end_date": "2026-04-21",
  "position": 0,
  "created_at": "2026-04-01T12:00:00.000Z",
  "updated_at": "2026-04-01T12:00:00.000Z"
}
```

### Task document (nested collaborators)

```json
{
  "id": "T-001",
  "title": "Example task",
  "description": null,
  "status": "todo",
  "priority": "medium",
  "assignee_ids": [6, 3],
  "reporter_id": 6,
  "project_id": "proj-1",
  "sprint_id": "sprint-1",
  "due_date": "2026-05-01",
  "estimated_hours": 8,
  "logged_hours": 2,
  "tags": ["frontend"],
  "position": 0,
  "created_at": "2026-04-01T12:00:00.000Z",
  "updated_at": "2026-04-01T12:00:00.000Z",
  "comments": []
}
```

### Client quote with line items (Estimator)

```json
{
  "id": "quote-1",
  "title": "Client estimate",
  "project_id": "proj-1",
  "client_name": "Acme",
  "notes": null,
  "platform": "react_next",
  "status": "draft",
  "requirements_unclear": false,
  "addons": {
    "pm_enabled": true, "pm_basis": "simple", "pm_pct": 10,
    "responsive_enabled": true, "responsive_pct": 25,
    "design_enabled": true, "design_pct": 35,
    "qa_enabled": true, "qa_pct": 20
  },
  "line_items": [
    {
      "id": "li-abc",
      "title": "Feature A",
      "module": null,
      "category_id": null,
      "catalog_id": null,
      "base_hours": 8,
      "tier": "advanced",
      "quantity": 1,
      "hours": 12,
      "depends_on": []
    }
  ],
  "discovery": null,
  "created_at": "2026-04-01T12:00:00.000Z",
  "updated_at": "2026-04-01T12:00:00.000Z"
}
```

### Availability entry

```json
{
  "id": "avail-1",
  "user_id": 3,
  "start_date": "2026-06-01",
  "end_date": "2026-06-05",
  "kind": "pto",
  "note": "Leave",
  "created_at": "2026-04-01T12:00:00.000Z",
  "updated_at": "2026-04-01T12:00:00.000Z"
}
```

### Notification

```json
{
  "id": "n-1",
  "text": "Something happened.",
  "at": "2026-04-01T12:00:00.000Z",
  "read": false,
  "href": "/projects/proj-1/sprints/sprint-1",
  "project_id": "proj-1"
}
```

### Relationships map (IDs only, JSON-friendly)

```json
{
  "project": {
    "idField": "id",
    "children": {
      "sprints": { "foreignKeyOnChild": "project_id", "collection": "sprints" },
      "tasks": { "foreignKeyOnChild": "project_id", "collection": "tasks" },
      "proposals": {
        "foreignKeyOnChild": "project_id",
        "optional": true,
        "collection": "proposals"
      }
    }
  },
  "sprint": {
    "idField": "id",
    "parent": {
      "foreignKeyOnChild": "project_id",
      "parentCollection": "projects"
    },
    "children": {
      "tasks": { "foreignKeyOnChild": "sprint_id", "collection": "tasks" }
    }
  },
  "task": {
    "parents": [
      {
        "foreignKeyOnTask": "project_id",
        "parentCollection": "projects",
        "required": true
      },
      {
        "foreignKeyOnTask": "sprint_id",
        "parentCollection": "sprints",
        "required": false,
        "meaningIfNull": "backlog_for_project"
      }
    ],
    "people": {
      "assignees": { "field": "assignee_ids", "references": "team_member.id" },
      "reporter": { "field": "reporter_id", "references": "team_member.id" }
    },
    "embeds": { "comments": "Comment[] nested on task" }
  },
  "teamMember": {
    "source": "lib/dummy reference list (not persisted as its own timeline-* key)",
    "referencedBy": [
      "task.assignee_ids",
      "task.reporter_id",
      "availability.user_id",
      "project.owner_id",
      "weeklyCapacity.overrides keys"
    ]
  }
}
```

---

## Ephemeral UI state (not persisted)

| State                                                                           | Purpose                       |
| ------------------------------------------------------------------------------- | ----------------------------- |
| `useTasksStore`: `selectedTaskId`, `activeView` (`kanban` \| `list` \| `table`) | Task board pane               |
| `useTaskTimerStore`: `timers[taskId]`                                           | Active/paused timers per task |

Filters on individual pages (`TasksPage`, etc.) live in React `useState` unless otherwise wired.

---

_Generated to match repository types and stores; the generated `types/database.types.ts` is the
authoritative live shape — keep this in sync with it and `supabase/migrations/` as the schema evolves.
Last updated: 2026-07-15 — Estimator (Discovery merged), offboarding/invite fields, assignment
lifecycle + `time_entries`; estimator tables corrected to the v2 shape._
