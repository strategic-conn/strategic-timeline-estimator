# Supabase Integration — Phase-by-Phase Plan

> **✅ DONE (historical record).** This roadmap is complete — the app is live on Supabase via the
> **synced-store bridge** (each store hydrates + writes through optimistically behind
> `isSupabaseConfigured`, with the demo fallback). The final wiring differs from the plan in one
> way: **no TanStack Query** (installed but unwired; the bridge covers caching) — where this doc
> says "replace the hook's body with Supabase queries," read "the store hydrates + writes through."
> For current architecture see [backend-supabase.md](backend-supabase.md); for current truth see
> [CLAUDE.md](../CLAUDE.md). Kept as a record of how the migration was sequenced.

> **Purpose (original):** a chunked, low-risk roadmap to move this app from the demo (Zustand +
> `localStorage`) to live Supabase, one feature slice at a time. Planning doc only — no code
> changes here.
>
> **Companions:** [backend-supabase.md](backend-supabase.md) (architecture + wiring patterns),
> [data-mapping.md](data-mapping.md) (current data shapes), and the schema/RLS already in
> [`supabase/migrations/`](../supabase/migrations/) (`0001_init.sql`, `0002_rls.sql`).
> [CLAUDE.md](../CLAUDE.md) is the canonical onboarding doc.

---

## Guiding principles

1. **Swap behind the hooks.** Every feature reads data through a hook (`useProjects`,
   `useSprints`, `useTasks`, …). Today those hooks just return a Zustand store. Integration =
   replacing each hook's body with Supabase queries. Components should change as little as possible.
2. **One slice at a time, always shippable.** Each phase leaves the app working. Use a feature
   flag so a half-migrated store never reaches users (see "Cross-cutting → Feature flagging").
3. **RLS is the wall; `usePermissions()` is the mirror.** Keep them in lockstep every phase.
4. **Schema is in-repo.** Change shapes in `supabase/migrations/`, then `npm run db:types`.
   Never hand-edit `types/database.types.ts`.
5. **Demo data is disposable.** This is a fresh-start migration, not a production data move —
   seed Supabase rather than importing `localStorage` (see "Cross-cutting → Data migration").

---

## The biggest shift to plan for: sync → async

Right now stores are **synchronous**: components call `createProject(payload)` (returns `void`,
updates instantly) and read `projects` straight off the store. Supabase is **async** and can fail.

So each hook swap means the consuming components must handle:

- `isLoading` / `isError` / empty — the three states (many components already have empty states).
- `await mutateAsync(...)` instead of fire-and-forget, with `onError` toasts.
- Server-generated **UUIDs** instead of client `proj-N` / `T-001` ids.
- Optimistic updates where the UX needs instant feedback (drag-drop, status, reactions).

This is why the work is bigger than "rewrite the hook" — budget for touching the components that
call each hook. The phases below call out the blast radius for each.

---

## Phase 0 — Foundations (no feature swap yet)

**Goal:** stand up the project and tooling so feature phases are pure plumbing.

- [ ] Create a Supabase project; put URL + keys in `.env.local` (template: `.env.example`).
- [ ] `npm run db:push` to apply `0001_init.sql` + `0002_rls.sql`.
- [ ] `npm run db:types` → regenerate `types/database.types.ts`; type the clients
      (`createBrowserClient<Database>(…)` in `lib/supabase/client.ts`, same in `server.ts`).
- [ ] Install + wire **TanStack Query**: add `QueryClientProvider` in
      `components/layouts/app-providers.tsx`; create `lib/constants/query-keys.ts` (key factory).
- [ ] Add a Supabase error→message helper (e.g. `lib/supabase/parse-error.ts`) for `onError` toasts.
- [ ] Add a **feature flag** mechanism (e.g. `NEXT_PUBLIC_USE_SUPABASE` or per-resource flags) so
      hooks can switch between the Zustand demo and Supabase during rollout.
- [ ] Smoke test: a throwaway component reads one seeded row end-to-end.

**Acceptance:** app builds and runs unchanged on the demo; a live Supabase read works behind a flag.

---

## Phase 1 — Auth, Profiles & Team directory

**Why first:** every RLS policy depends on `auth.uid()` and `profiles.role`. Nothing else can be
correctly secured until identity is real. `profiles` is also the **team directory** that tasks,
calendar, and workload reference — so this unblocks the FK relationships everywhere downstream.

- **Tables:** `auth.users`, `profiles` (+ the `handle_new_user` trigger from `0001_init.sql`).
- **Swap:** `store/auth-store.ts` → real session; add `useAuth` (sign in/up/out, current profile).
  - Login/register pages call `supabase.auth.signInWithPassword` / `signUp`.
  - Settings `ProfileForm` updates the `profiles` row instead of the demo store.
  - `usePermissions()` reads `profiles.role` (its `UserRole` enum already matches the DB enum).
- **Replace `TEAM_MEMBERS`** (`lib/dummy/tasks.data.ts`) with a `useTeam()` hook selecting
  `profiles`. ⚠️ **High blast radius** — assignee pickers, avatars, calendar, workload all read
  `TEAM_MEMBERS`. Keep a `profiles → TeamMember` adapter so consumers change minimally.
- **Route protection:** add the auth guard in root `middleware.ts` (redirect unauthenticated →
  `/login`); the session-refresh no-op is already there.
- **RLS to verify:** `profiles` read for authenticated, self-update, admin-manage.

**ID note:** numeric demo user ids (`TeamMember.id: number`, `owner_id`, `assignee_ids`) become
`profiles.id: uuid`. Plan the type change in `types/*` (or keep an adapter) before Phase 2.

**Acceptance:** real sign-in/out; role drives the UI; team pickers list real profiles.

---

## Phase 2 — Projects (the reference slice)

**Why second:** smallest core entity; establishes the repeatable swap pattern the rest copy.

- **Table:** `projects`.
- **Swap:** `hooks/useProjects.ts` → TanStack Query over Supabase. Split the single store into:
  `useProjects()` (list), `useProject(id)`, `useCreateProject`, `useUpdateProject`,
  `useArchiveProject`, `useDeleteProject` (mirrors the current store actions in `projects-store.ts`).
- **Preserve behaviors:** the store currently fires `pushWorkspaceActivity` and `offerUndoToast`
  on create/delete — re-implement these in mutation `onSuccess` (Undo = inverse mutation, not a
  state snapshot).
- **ID change:** drop `nextProjectId()` (`proj-N`); Postgres generates UUIDs. Update components
  that assume the `proj-N` shape and routing params.
- **Components touched:** `ProjectsPage`, `ProjectCard`, Create/Edit/Delete modals — add
  loading skeletons + error states (empty state already exists).
- **RLS to verify:** read = authenticated; create/update = admin+manager; delete = admin.

**Acceptance:** projects CRUD is fully live; this hook becomes the template for Phases 3–7.

---

## Phase 3 — Sprints & Tasks (the core, largest phase)

**Why here:** the heart of the app, and it depends on projects (Phase 2) + profiles (Phase 1).
Consider splitting into 3a (sprints), 3b (tasks + assignees), 3c (comments/reactions).

- **Tables:** `sprints`, `tasks`, `task_assignees`, `task_comments`, `comment_reactions`.
- **Swap:** `useSprints`, `useTasks` → Supabase. Tasks fetch with joins
  (`select("*, task_assignees(profile_id), task_comments(*, comment_reactions(*))")`).
- **Assignees:** `Task.assignee_ids: number[]` becomes the `task_assignees` join table — write
  inserts/deletes alongside the task; expose as an array to components via an adapter.
- **Comments/reactions:** nested `Task.comments[]` flatten to `task_comments` (+ `parent_id` for
  replies) and `comment_reactions` rows.
- **Optimistic updates (required):** Kanban drag-drop (`status` + `position`) and status changes
  must update instantly via TanStack `onMutate` + rollback — they feel broken on a round-trip.
- **Backlog:** `sprint_id IS NULL` filter (already the demo's convention).
- **Components touched:** `TasksPage`, `KanbanBoard`/`Column`, `TaskCard`, `TaskDetailDrawer`,
  list/table views, comment section, create/edit modals, `ProjectOverviewPage`, `SprintCard`.
- **RLS to verify:** task create/edit = admin+manager+member; delete = admin+manager; comments =
  non-viewers add, author/admin/manager delete.

**Acceptance:** boards, backlog, drag-drop, and comments all run on Supabase with no visible lag.

---

## Phase 4 — Collaboration: Notifications & Activity feed (first Realtime)

- **Table:** `notifications` (the activity feed reads the same rows, filtered).
- **Swap:** `store/notifications-store.ts` + `lib/activity/workspace-push.ts` → insert
  `notifications` rows; `useNotifications()` selects the current user's rows.
- **Realtime:** subscribe to `INSERT` on `notifications` (filter `recipient_id`) so the bell +
  feed update live — first use of Supabase Realtime. Earlier phases' writes should start
  emitting notification rows here.
- **Components touched:** `NotificationBell`, `ActivityFeedClient/List`, per-project activity.
- **RLS to verify:** users see/clear only their own (`recipient_id = auth.uid()`).

**Acceptance:** acting in one session pushes a live notification to the recipient.

---

## Phase 5 — Scheduling: Availability, PTO & Weekly capacity

- **Tables:** `availability_entries`, `weekly_capacity`.
- **Swap:** `store/availability-store.ts`, `store/weekly-capacity-store.ts` → Supabase
  (calendar, workload, PTO settings, admin team time-off).
- **Permissions nuance:** members edit only their own PTO/capacity; admin+manager edit anyone —
  enforced by RLS and mirrored by `usePermissions().canEditOthersAvailability`.
- **Components touched:** calendar client, `WorkloadClient`, `MemberWeeklyHoursInput`,
  `TimeOffSettingsSection`, `AdminTeamTimeOffSection`.

**Acceptance:** PTO/capacity persist server-side and respect the per-person edit rules.

---

## Phase 6 — Proposal estimator

**Why late:** self-contained, gated to admin/manager, and already has a clean data shape — low
risk once the pattern is proven.

- **Table:** `proposals` (JSONB `line_items` + `addons` + `requirements_unclear`).
- **Swap:** `store/proposal-estimator-store.ts` → Supabase. The estimator math
  (`lib/constants/proposal-estimator.ts`) and client-side PDF/Excel export are unchanged.
- **Optional later:** server-side export as a Supabase Edge Function → Storage bucket (the
  client-side jsPDF/xlsx path keeps working meanwhile).
- **Components touched:** `ProposalsListClient`, `ProposalEditorClient` (+ children).
- **RLS to verify:** all proposal access = admin+manager (same gate as `canExportProposals`).

**Acceptance:** quotes persist and load from Supabase; exports unchanged.

---

## Phase 7 — Storage, Realtime polish & hardening

- **Storage:** avatars bucket for `profiles.avatar_url`; optional `exports` bucket for proposals.
- **Realtime polish:** extend live updates to the Kanban board and `task_comments` for
  multi-user editing.
- **Security review:** audit every RLS policy against the permission matrix; verify the
  service-role key is never bundled client-side; confirm no `select *` leaks columns.

---

## Phase 8 — Cleanup & cutover

- [ ] Remove `lib/dummy/*` and the `DUMMY_*` seeds from stores.
- [ ] Remove Zustand `persist`/`localStorage` from migrated stores (keep Zustand only for true UI
      state: board view, modals, timers).
- [ ] Drop the feature flags once every slice is live.
- [ ] Delete dead code (old sync store actions, `proj-N`/`T-001` id generators).
- [ ] Update `data-mapping.md` "Status" columns and CLAUDE.md "Data Access Map" to **Wired**.
- [ ] Perf pass (query `staleTime`, pagination on long lists) + WCAG pass (CLAUDE.md Phase 4).

---

## Cross-cutting concerns

### ID strategy
Demo uses text ids (`proj-1`, `T-001`) and numeric user ids; Supabase uses `uuid`. Two options:
- **Recommended:** switch `types/*` ids to `string` (UUID) and let Postgres generate them. The
  app already treats most ids as opaque strings, so the change is mostly at create/routing points.
- Keep an adapter layer if a big-bang type change is too risky mid-migration.

### Data migration (from localStorage)
This is demo data — **don't migrate it**. Seed Supabase with a `supabase/seed.sql` (or a one-off
script) reflecting `lib/dummy/*`, minting a `profiles` row per `TEAM_MEMBERS` member. A localStorage
importer is only worth writing if a real user has demo data they care about.

### Feature flagging / rollback
Gate each hook on a flag so a half-built slice stays on the demo path. Rollback = flip the flag.
Because the swap is hook-local, blast radius per phase is contained.

### Optimistic updates
Required for drag-drop, status changes, and reactions (TanStack `onMutate` + rollback). Optional
elsewhere — start simple, add where the UX needs instant feedback.

### Permissions ↔ RLS lockstep
Any change to `usePermissions()` must have a matching policy in `0002_rls.sql`, and vice-versa.
Treat a blocked write (Postgres/RLS error) as a real, handled error path in `onError`.

### Realtime (optional but high-value here)
Best fits notifications/activity (Phase 4), the Kanban board, and comments. Adds live multi-user
collaboration with little code; skip for low-churn data.

---

## Suggested sequencing & rough effort

| Phase | Slice                              | Depends on | Relative size |
| ----- | ---------------------------------- | ---------- | ------------- |
| 0     | Foundations (project, types, TQ)   | —          | S             |
| 1     | Auth + Profiles + Team             | 0          | M             |
| 2     | Projects (reference slice)         | 1          | M             |
| 3     | Sprints & Tasks (+ comments)       | 1, 2       | **L**         |
| 4     | Notifications & Activity (Realtime)| 1, 3       | M             |
| 5     | Availability / PTO / Capacity      | 1          | M             |
| 6     | Proposal estimator                 | 1          | S–M           |
| 7     | Storage + Realtime polish + RLS    | all        | M             |
| 8     | Cleanup & cutover                  | all        | S             |

> Phases 5 and 6 only depend on Phase 1, so they can run in parallel with 3/4 if you have the
> bandwidth. Phase 3 is the critical-path bottleneck — protect time for it.

---

## Definition of done (per phase)

- Hook(s) read/write Supabase behind the existing seam; components handle loading/error/empty.
- RLS verified against the permission matrix (try each role).
- Optimistic UX preserved where it existed in the demo.
- `npm run build` + `tsc` clean; the relevant `data-mapping.md` Status flipped to **Wired**.
- Feature flag removed (or scheduled for Phase 8) once stable.

_Last updated: 2026-06-22 — planning doc; no code changes yet._
