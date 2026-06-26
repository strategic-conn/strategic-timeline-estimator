# Backend — Supabase

> **Status: this is the chosen backend.** (The earlier Laravel REST plan is retired.) The SDK
> and the client seam are **scaffolded but not yet wired** — the app still runs on Zustand +
> `localStorage` (see [data-mapping.md](data-mapping.md)), and the schema in `supabase/migrations/`
> hasn't been pushed to a live project yet. This doc is the source of truth for the integration.

What's already in the repo:

- `@supabase/supabase-js` + `@supabase/ssr` installed.
- `lib/supabase/{client,server,middleware}.ts` + root `middleware.ts` (session refresh; no-op
  until env vars are set, so the demo keeps working).
- `supabase/migrations/0001_init.sql` (schema) and `0002_rls.sql` (RLS = the permission matrix).
- `.env.example`, `types/database.types.ts` placeholder, and `db:push` / `db:types` npm scripts.

The frontend is deliberately backend-agnostic: every feature reads/writes a Zustand store, so the
swap happens behind the hooks (`useProjects`, `useTasks`, …) — a contained change, not a rewrite.

---

## TL;DR — what changed from the old Laravel plan

> Kept for context — Laravel is retired. The right column is what we're building.

| Concern             | Old Laravel plan (retired)                      | Supabase (current)                                                 |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Auth                | Sanctum, httpOnly cookie session, BFF route     | Supabase Auth (GoTrue) + `@supabase/ssr`, cookie-stored JWT        |
| Authorization       | Enforced in Laravel controllers/policies        | **Postgres Row-Level Security (RLS)** policies on every table      |
| Data access         | REST endpoints + Axios + TanStack Query         | `supabase-js` (PostgREST) ± TanStack Query, or Server Components    |
| Who owns the schema | Backend dev (migrations in Laravel)             | **Us** — SQL migrations in `supabase/migrations/`                  |
| Server logic/export | Laravel controller (`GET /proposals/:id/export`)| Supabase **Edge Function** (Deno) or Postgres RPC                  |
| Realtime            | Would need Pusher/WebSockets bolt-on            | **Built in** — Supabase Realtime (a real win for this app)         |
| File storage        | Laravel filesystem / S3                         | Supabase Storage buckets                                           |
| Hosting shape       | Separate API origin + CORS                      | Supabase project (same SDK from browser + server)                  |

**Biggest practical differences if we go Supabase:**

1. **We own the database.** There's no separate backend dev handing us a Postman collection —
   the schema, RLS, and any server functions live in this repo under `supabase/`.
2. **Authorization moves into the database** as RLS. The `usePermissions()` matrix in the UI
   becomes a *mirror* of SQL policies, not the only gate.
3. **Realtime is free.** Notifications, the activity feed, task-board moves, and comments can
   subscribe to Postgres changes instead of polling.
4. **`user_id` becomes a UUID** from `auth.users`, replacing the demo's numeric `TeamMember.id`.

---

## Packages to add (none installed yet)

```bash
npm install @supabase/supabase-js @supabase/ssr
# TanStack Query is still recommended for cache/dedupe, same as the Laravel plan:
npm install @tanstack/react-query
```

`@supabase/ssr` is the App-Router-aware helper that stores the session in cookies and refreshes
it from middleware — the Next.js 16 equivalent of the cookie story we wanted from Sanctum.

---

## Environment variables

```env
# .env.local — never commit
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>     # safe in the browser; RLS protects data
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>        # server-only! bypasses RLS — never NEXT_PUBLIC_
```

> The anon key is *meant* to be public — security comes from RLS, not from hiding the key.
> The service-role key bypasses RLS and must only ever be used in server code / Edge Functions.
> This replaces `NEXT_PUBLIC_API_URL` from the Laravel plan.

---

## Proposed folder additions

```
lib/
└── supabase/
    ├── client.ts        # browser client (Client Components)
    ├── server.ts        # server client (Server Components, Route Handlers, Actions)
    └── middleware.ts     # session-refresh helper used by root middleware.ts
supabase/
├── migrations/          # SQL schema + RLS (source of truth for the DB)
├── functions/           # Edge Functions (e.g. proposal-export)
└── config.toml          # supabase CLI config
middleware.ts            # refreshes the auth cookie on every request
types/
└── database.types.ts    # `supabase gen types typescript` output (generated, do not hand-edit)
```

This replaces the Laravel plan's `lib/api/` (axios) folder. Where CLAUDE.md says "API function in
`lib/api/tasks.api.ts`", the Supabase equivalent is a typed query in a hook or server action.

---

## Auth flow (Supabase)

1. User signs in with `supabase.auth.signInWithPassword(...)` (or OAuth / magic link).
2. Supabase issues a JWT; `@supabase/ssr` persists it in **httpOnly cookies** — same XSS posture
   we wanted from Sanctum (no token in `localStorage`).
3. `middleware.ts` calls the SSR helper on every request to refresh the session cookie.
4. Server Components / Route Handlers read the user via the server client; RLS uses
   `auth.uid()` to scope every query automatically.
5. On sign-out, `supabase.auth.signOut()` clears the cookies.

```ts
// lib/supabase/client.ts — Client Components
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
```

```ts
// lib/supabase/server.ts — Server Components / Route Handlers / Server Actions
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          ),
      },
    },
  );
}
```

The current demo `store/auth-store.ts` (single `DEMO_USER`, role `manager`) becomes a thin
wrapper that hydrates from `supabase.auth.getUser()` + the `profiles` row, instead of a
hard-coded object. `usePermissions()` keeps working unchanged — it just reads the real role.

---

## Database schema (SQL)

The current entities live in [data-mapping.md](data-mapping.md). The demo uses text ids
(`proj-1`, `T-001`) and numeric user ids; in Supabase these become **UUIDs**, with people coming
from `auth.users`. Below is the normalized target. Proposals stay as a JSONB document for v1
(the estimator is a self-contained blob today — matches the `timeline-proposal-estimator`
localStorage shape — and can be normalized later).

```sql
-- ── people ───────────────────────────────────────────────────────────────
-- One row per auth user. role drives the permission matrix (mirrors usePermissions()).
create type user_role as enum ('admin', 'manager', 'member', 'viewer');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  role        user_role not null default 'member',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── projects → sprints → tasks ───────────────────────────────────────────
create type project_status as enum ('active', 'completed', 'archived');

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  status      project_status not null default 'active',
  owner_id    uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type sprint_status as enum ('planning', 'active', 'completed', 'cancelled');

create table sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  goal        text,
  status      sprint_status not null default 'planning',
  start_date  date not null,
  end_date    date not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type task_status   as enum ('todo', 'in_progress', 'in_review', 'done', 'blocked');
create type task_priority as enum ('low', 'medium', 'high', 'critical');

create table tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  sprint_id       uuid references sprints(id) on delete set null,  -- null = backlog
  title           text not null,
  description     text,
  status          task_status   not null default 'todo',
  priority        task_priority not null default 'medium',
  reporter_id     uuid not null references profiles(id),
  due_date        date,
  estimated_hours numeric,
  logged_hours    numeric,
  tags            text[] not null default '{}',
  position        int    not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- assignees are many-to-many (Task.assignee_ids[] in the demo)
create table task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

-- comments (+ reactions/replies were nested in the demo; flatten to rows)
create table task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null,
  parent_id   uuid references task_comments(id) on delete cascade,  -- reply thread
  created_at  timestamptz not null default now()
);

create table comment_reactions (
  comment_id  uuid not null references task_comments(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  emoji       text not null,
  primary key (comment_id, profile_id, emoji)
);

-- ── scheduling / capacity ────────────────────────────────────────────────
create type availability_kind as enum ('pto', 'unavailable', 'partial');

create table availability_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  kind        availability_kind not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table weekly_capacity (
  profile_id   uuid primary key references profiles(id) on delete cascade,
  hours_per_week numeric not null check (hours_per_week between 1 and 168)
);

-- ── notifications / activity feed ────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  text        text not null,
  href        text,
  project_id  uuid references projects(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── proposal estimator (JSONB document for v1) ───────────────────────────
-- line_items + addons + requirements_unclear match types/proposal.types.ts.
-- Normalize into proposal_line_items later if reporting/queries demand it.
create table proposals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id),
  project_id    uuid references projects(id) on delete set null,
  title         text not null,
  client_name   text,
  notes         text,
  platform      text not null,        -- wordpress | shopify | wix | squarespace | php | react_next | custom
  line_items    jsonb not null default '[]',
  addons        jsonb not null default '{}',
  requirements_unclear boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

> **Catalog data** (`lib/proposal-catalog/catalog.json`, generated from the workbook) can stay
> a static frontend asset, or move to read-only `catalog_categories` / `catalog_items` tables
> if coordinators should edit it without a redeploy. No rush — it's reference data.

---

## Row-Level Security — the permission matrix as policies

This is the heart of the Supabase plan. The matrix in CLAUDE.md ("User Roles & Permissions")
gets enforced by the database, so a compromised client still can't exceed its role.

```sql
-- helper: current user's role
create or replace function current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

alter table projects enable row level security;
alter table tasks    enable row level security;
-- …enable on every table…

-- Everyone signed in can read (matrix: "View all content" = all roles)
create policy "read projects" on projects
  for select using (auth.role() = 'authenticated');

-- Create/Edit project: admin + manager
create policy "write projects" on projects
  for insert with check (current_role() in ('admin', 'manager'));
create policy "update projects" on projects
  for update using (current_role() in ('admin', 'manager'));

-- Delete project: admin only
create policy "delete projects" on projects
  for delete using (current_role() = 'admin');

-- Tasks: create/edit = admin/manager/member; delete = admin/manager (matrix)
create policy "read tasks" on tasks
  for select using (auth.role() = 'authenticated');
create policy "create tasks" on tasks
  for insert with check (current_role() in ('admin', 'manager', 'member'));
create policy "update tasks" on tasks
  for update using (current_role() in ('admin', 'manager', 'member'));
create policy "delete tasks" on tasks
  for delete using (current_role() in ('admin', 'manager'));

-- PTO: edit others = admin/manager; members may edit only their own
create policy "own or privileged availability" on availability_entries
  for all using (
    user_id = auth.uid() or current_role() in ('admin', 'manager')
  ) with check (
    user_id = auth.uid() or current_role() in ('admin', 'manager')
  );

-- Proposals (estimator) = "Export proposals" gate: admin + manager only
create policy "proposals admin/manager" on proposals
  for all using (current_role() in ('admin', 'manager'))
  with check (current_role() in ('admin', 'manager'));

-- Notifications: a user sees only their own
create policy "own notifications" on notifications
  for select using (recipient_id = auth.uid());
```

> **Rule of thumb:** `usePermissions()` in the UI and these RLS policies must stay in lockstep.
> The UI hides buttons for UX; RLS is the real wall. If they disagree, the DB wins (a blocked
> write surfaces as a Postgres error to handle in the mutation's `onError`).

---

## Frontend pattern changes (vs the Axios pattern in CLAUDE.md)

CLAUDE.md's "API Call Pattern" (define types → axios fn → TanStack hook → component) becomes:

```ts
// hooks/useTasks.ts — Supabase + TanStack Query
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function useTasks(sprintId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["tasks", "sprint", sprintId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_assignees(profile_id), task_comments(*)")
        .eq("sprint_id", sprintId)
        .order("position");
      if (error) throw error;       // RLS denial / network → onError
      return data;
    },
  });
}

export function useCreateTask() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; project_id: string; sprint_id?: string }) => {
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
    onError: (e) => toast.error(e.message),   // replaces parseApiError(axios)
  });
}
```

The component layer (`const { mutate } = useCreateTask()`) is **identical** to the Laravel plan —
which is exactly why keeping all data access behind `hooks/` today protects us either way.

**Optimistic updates** (CLAUDE.md rule #4: drag-drop, status changes) work the same with
TanStack's `onMutate`/rollback, now talking to Supabase instead of axios.

---

## Realtime (the upgrade Supabase unlocks)

Polling-free live updates for the collaborative surfaces:

```ts
// subscribe to new notifications for the bell + activity feed
const supabase = createClient();
supabase
  .channel("notifications")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications",
      filter: `recipient_id=eq.${userId}` },
    (payload) => qc.invalidateQueries({ queryKey: ["notifications"] }),
  )
  .subscribe();
```

Good candidates: `store/notifications-store.ts`, the activity feed, the Kanban board
(task `status`/`position` changes), and `task_comments`. Today these are local-only; Realtime
turns them multi-user with little extra code.

---

## Storage

- **Avatars** (`profiles.avatar_url`) → a public `avatars` bucket.
- **Proposal exports**: the Laravel plan's `GET /proposals/:id/export` becomes either
  - the existing client-side jsPDF/xlsx path (already built — keep it as-is), or
  - a Supabase **Edge Function** (`supabase/functions/proposal-export/`) that renders server-side
    and drops the file in a private `exports` bucket, returning a signed URL.

---

## Migration considerations (demo → Supabase)

| Demo today                                | Supabase target                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| Text ids (`proj-1`, `T-001`)              | `uuid` PKs (`gen_random_uuid()`)                             |
| Numeric `TeamMember.id` / `user_id`       | `uuid` from `auth.users` via `profiles.id`                   |
| Nested `Task.comments[]` / reactions      | `task_comments` + `comment_reactions` rows                  |
| `Task.assignee_ids: number[]`             | `task_assignees` join table                                 |
| Zustand `persist` to `localStorage`       | Postgres tables + RLS; TanStack Query cache replaces persist |
| `lib/dummy/*` seed data                   | `supabase/seed.sql`                                          |
| Permissions only in `usePermissions()`    | RLS policies (UI hook becomes a mirror, not the gate)        |

A one-time import script can read the `timeline-*` localStorage blobs and `upsert` them into the
tables, minting UUIDs and a `profiles` row per `TEAM_MEMBERS` entry.

---

## What stays the same either way

- All UI components, the three-states rule (loading/error/empty), Zod validation, DOMPurify.
- The `hooks/` seam — components never learn which backend they're on.
- TanStack Query as the server-state layer (recommended for both).
- The proposal estimator math and client-side PDF/Excel export already built this milestone.

> _Companion to [CLAUDE.md](../CLAUDE.md) and [data-mapping.md](data-mapping.md). Update all three
> together when the data model changes. Last updated: 2026-06-22 (Supabase confirmed as the backend)._
```
