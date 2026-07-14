# Workflow Revamp — Discovery → Proposal → Project → Task Acceptance → Workload

> **✅ BUILT (historical record).** Phases A–E are implemented: proposal approval + convert-to-project
> (`0015`), task-assignment accept/reject/pass lifecycle (`0016`), `time_entries` + logged-hours guard
> (`0017`/`0018`), and personal vs team Workload. Since this plan, **Discovery was merged INTO the
> Proposal estimator** (now one "Estimator"; see the `estimator-merge` note + [CLAUDE.md](../CLAUDE.md)),
> so the "Discovery doc → Proposal" hand-off is now two input modes of one tool. §3 decisions were all
> resolved as recommended. Kept as a record of the design.

> **Purpose:** a phased, low-risk plan to add the sales-to-delivery workflow the client wants,
> on top of the existing Supabase-wired app. Planning doc — **no code changes here.** Each phase
> leaves the app working (behind `isSupabaseConfigured`, with the demo fallback intact) and keeps
> **RLS ↔ `usePermissions()` in lockstep**, matching the approach in
> [supabase-integration-plan.md](supabase-integration-plan.md).
>
> **Companion docs:** [backend-supabase.md](backend-supabase.md), [data-mapping.md](data-mapping.md),
> schema in [`supabase/migrations/`](../supabase/migrations/).

---

## 1. The flow the client wants

```
 SALES ─────────►  DISCOVERY doc ──►  PROPOSAL ──►  (approved) ──►  COORDINATOR
                   (scoping wizard)   (client quote)                starts a PROJECT
                                                                         │
                                                                         ▼
                                                      creates SPRINTS + TASKS, assigns each
                                                      task to a DEVELOPER (but cannot log hours)
                                                                         │
                                                        notify ──────────┤
                                                                         ▼
                                              DEVELOPER responds to the assignment:
                                                • Accept  → owns it, logs hours
                                                • Reject  → back to coordinator to reassign
                                                • Pass    → hand to another developer
                                                                         │
                                                                         ▼
                                            WORKLOAD becomes two experiences:
                                              • Personal ("my work + my hours vs capacity")
                                              • Admin/coordinator ("track everyone's workload")
```

**Personas → who they are in the app today**

| Persona | What they do | Maps to |
| --- | --- | --- |
| **Sales** | Build discovery docs → proposals | `manager` (already gated to admin/manager via `canExportProposals`) |
| **Workflow coordinator** | Approve proposal, start project, create sprints/tasks, **assign** tasks; **does not log hours** | `manager` |
| **Developer / web dev** | Accept/reject/pass assigned tasks, **log hours** | `member` |
| **Admin** | Everything + track everyone's workload | `admin` |

> **Recommendation (see §3, decision D1):** don't add new roles. Sales and coordinator are both
> `manager`; the **per-user page access** we already shipped (Team → Manage access) lets you give a
> "sales" manager only Discovery/Proposals and a "coordinator" manager only Projects/Workload.
> Role = data capability; page-access = surface. This avoids a role-system rewrite.

---

## 2. What already exists vs what's new

| Capability | Today | This revamp |
| --- | --- | --- |
| Discovery → proposal | ✅ `discovery-store` → `createProposalFromDraft` (`proposal-estimator-store`) | unchanged |
| Proposal **approval state** | ❌ no status field | **NEW**: `proposals.status` (draft/sent/approved/rejected) |
| Proposal → **project** | ⚠️ optional `proposals.project_id` link, no action | **NEW**: "Start project from proposal" (+ optional seed sprints/tasks from line items) |
| Project / sprint / task CRUD | ✅ live | unchanged |
| Task **assignment** | ✅ `task_assignees` (multi, immediate) | **NEW**: per-assignment **lifecycle** (pending/accepted/rejected/passed) |
| Assignment **notifications** | ✅ `notifyAboutTask` on assign | extend: notify on accept/reject/pass |
| **Hour logging** | ✅ timer + `logged_hours`; `useTimeTrackingAccess` gates to assignee; managers/admins can edit total | **TIGHTEN**: only **accepted** assignees log; coordinators can't; (admin correction optional) |
| Time **history / attribution** | ❌ `logged_hours` is a single running total, no per-day/per-person history | **NEW (recommended)**: `time_entries` table |
| **Workload** page | ✅ `WorkloadClient` — team overview, capacity vs open estimates | **REVAMP**: personal view + enhanced admin/team view |
| Notifications / realtime | ✅ targeted notifications + `task_assignees` already in `supabase_realtime` | reuse; handle assignee **UPDATE** events |
| Roles / permissions | ✅ 4 roles + RLS + per-user page access | reuse; add a few gates |

---

## 3. Open decisions to confirm before Phase A

These fork the architecture — please confirm (my recommendation in **bold**).

- **D1 — Roles.** Keep the 4 roles (sales+coordinator = `manager`, developer = `member`), differentiating sales vs coordinator with **per-user page access**? **Recommended: yes.** (Alternative: add real `sales`/`coordinator`/`developer` roles → touches every RLS policy + `usePermissions`; much larger.)
- **D2 — Assignment model.** Keep **multi-assignee** but give each `task_assignees` row a **status**, where "accepted" assignees are the workers? **Recommended: yes** (additive, backward-compatible; existing rows default to `accepted`). (Alternative: single-owner-per-task → bigger data change, breaks the current multi-avatar UI.)
- **D3 — "Pass to another dev."** Is a pass **coordinator-mediated** (dev rejects → coordinator reassigns) or **peer-to-peer** (dev directly hands to a chosen dev)? **Recommended: allow both** — Reject bounces to coordinator; Pass lets the dev pick a teammate directly (both notify the coordinator).
- **D4 — Who logs hours.** Only **accepted assignees** log; **coordinators/managers cannot**; **admins may correct** (audited)? **Recommended: yes.** This changes today's "managers can edit logged total."
- **D5 — Time history.** Introduce a **`time_entries`** table (per-session rows: task, person, hours, when) so "hours this week per person" and hour attribution are real? **Recommended: yes** (it's the backbone of a real workload view + the audit trail behind D4). `logged_hours` becomes a cached sum.
- **D6 — Proposal approval.** Approval is an **in-app action by admin/manager** (representing client sign-off), not an external e-sign flow? **Recommended: yes for now** (external client approval / e-sign = future).
- **D7 — Auto-seed.** When converting an approved proposal to a project, **auto-create tasks from the line items** (each line → a task with `estimated_hours` = its hours)? **Recommended: optional toggle** in the convert dialog (default on).

---

## 4. Data model changes (backend)

All additive and backward-compatible. Each ships in its phase's migration; run `npm run db:types` after.

### 4.1 `proposals` — approval + lifecycle (Phase A)
```sql
alter table proposals
  add column if not exists status text not null default 'draft'
    check (status in ('draft','sent','approved','rejected'));
-- project_id already exists (set when converted). Optional: approved_by uuid, approved_at timestamptz.
```
RLS unchanged (proposals already admin/manager `for all`). Convert-to-project reuses the existing
`create projects` policy (admin/manager).

### 4.2 `task_assignees` — assignment lifecycle (Phase B)
```sql
alter table task_assignees
  add column if not exists status text not null default 'accepted'   -- existing rows = accepted
    check (status in ('pending','accepted','rejected','passed')),
  add column if not exists assigned_by uuid references profiles(id),
  add column if not exists responded_at timestamptz,
  add column if not exists note text;
```
- New coordinator assignments insert with `status='pending'`, `assigned_by = auth.uid()`.
- **RLS refinement:** an assignee may update **their own** row's `status`/`note`/`responded_at`
  (`profile_id = auth.uid()`); coordinators (admin/manager) may insert/delete/reassign. Split the
  current single `write task_assignees` policy into insert/update/delete so a developer can respond
  without being able to touch others' assignments.
- **Realtime:** `task_assignees` is already in `supabase_realtime` (migration `0008`). Extend
  `WorkspaceSync`'s handler to also apply **UPDATE** (status change), and add an
  `applyRealtimeAssigneeStatus` to `tasks-store`.

### 4.3 `time_entries` — hour attribution (Phase C/D)
```sql
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  hours       numeric not null check (hours > 0),
  note        text,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index time_entries_task_idx on time_entries (task_id);
create index time_entries_profile_idx on time_entries (profile_id, logged_at);
-- RLS: read = authenticated; insert = the logger themselves AND an accepted assignee;
--      update/delete = own recent entry or admin (correction).
```
- `tasks.logged_hours` stays as a **cached sum** (keep the current UI working); a trigger or the
  store keeps it in sync on insert. This means Phases before C are unaffected.
- **D4 enforcement (backend):** a `before update` trigger on `tasks` rejecting `logged_hours`
  changes unless the actor is an accepted assignee or admin (same pattern as the `0009` role-guard
  trigger) — so the "coordinator can't log hours" rule holds even against direct API calls.

---

## 5. Frontend changes (by area)

- **Proposals** (`ProposalsListClient`, `ProposalEditorClient`): status badge + "Send"/"Mark
  approved"/"Reject" controls; on approved, a **"Start project"** action → convert dialog (project
  name prefilled from proposal, optional "create tasks from line items" toggle) → `projects-store`
  create + link `proposals.project_id` + status. New store actions in `proposal-estimator-store`.
- **Task drawer** (`TaskDetailDrawer`): for a **pending** assignee, an **Accept / Reject / Pass**
  action row (Reject + Pass open a small dialog for a note / teammate picker). For others, show each
  assignee's status (pending/accepted chip). New `tasks-store` actions:
  `respondToAssignment(taskId, status, note?)`, `passAssignment(taskId, toProfileId, note?)`.
- **"Assigned to me" inbox:** surface pending assignments — a filter on the board + a badge on the
  Notification bell (reuse the targeted notifications already firing on assign). Optionally a small
  `/dashboard` card "Awaiting your response (N)".
- **Time tracking** (`TaskTimeTracker`, `useTimeTrackingAccess`): gate timer + saved-total edit to
  **accepted assignees** (D4). On "Stop", write a `time_entries` row (Phase C) instead of only
  bumping `logged_hours`.
- **Workload** (`WorkloadClient`): split into
  - **My workload** (default for `member`): my accepted tasks, hours logged **this week** (from
    `time_entries`) vs my `weekly_capacity`, overdue, grouped by project.
  - **Team workload** (default for `manager`/`admin`): the current overview + acceptance status,
    per-person capacity vs committed/logged, over-allocation flags, filters (project/person).
  - Which view shows is driven by **role** (and respects page access). A role with both can toggle.

---

## 6. Notifications & realtime (reuse what's there)

- Assign → notify developer (**exists**: `notifyAboutTask`). Add: Accept/Reject/Pass → notify
  `assigned_by` (the coordinator) and, for Pass, the new developer. All via the existing
  `notifications-store.notify()` + `lib/activity/recipients.ts`.
- Activity log lines for approvals/conversions/assignment-responses via `pushWorkspaceActivity`
  (they auto-get actor name + project scope + a category color on `/activity`).
- Realtime: assignment status changes stream through the existing `workspace:board` channel once we
  handle `task_assignees` UPDATE events (§4.2).

---

## 7. Phased rollout (each phase is shippable)

> Order chosen so each phase delivers value and the next builds on it. Demo fallback + RLS↔UI
> lockstep every phase. `tsc` + `next build` green before ship.

**Phase A — Proposal approval & convert-to-project** *(handoff sales → coordinator)*
- Backend: `proposals.status` (`0015`). Frontend: status controls + Start-project convert dialog
  (optional line-item→task seeding). Acceptance: an approved proposal becomes a real project in one
  click, linked both ways.

**Phase B — Task assignment acceptance lifecycle** *(the core new concept)*
- Backend: `task_assignees` status columns + RLS split + realtime UPDATE (`0016`). Frontend:
  Accept/Reject/Pass in the drawer, assignment-status chips, "assigned to me" surfacing, coordinator
  notifications. Acceptance: a coordinator assigns → dev is notified → dev accepts/rejects/passes →
  coordinator sees the outcome live.

**Phase C — Hour logging tightened + time entries** *(D4/D5)*
- Backend: `time_entries` table + RLS + `logged_hours` sync + the logged-hours guard trigger
  (`0017`). Frontend: timer/edit gated to accepted assignees; "Stop" writes a time entry; coordinator
  view-only. Acceptance: only accepted developers can add hours; coordinators can't; every hour is
  attributed to a person and time.

**Phase D — Workload: personal view** *(developer experience)*
- Frontend only (reads `time_entries` + `weekly_capacity` + accepted tasks). "My workload" default
  for members. Acceptance: a developer opens Workload and sees their own week at a glance.

**Phase E — Workload: team/admin view** *(tracking)*
- Frontend: enhance the current overview with acceptance status, logged-vs-capacity, over-allocation,
  filters; role/page-access decides personal-vs-team default. Acceptance: an admin/coordinator tracks
  everyone's real workload.

> Phases D and E are frontend-heavy and low-risk (they read data the earlier phases produce).
> A and B are the critical path.

---

## 8. Cross-cutting concerns

- **Demo fallback:** every new store action branches on `isSupabaseConfigured`; demo keeps working
  with in-memory defaults (existing assignments treated as `accepted`, no approval gating).
- **Backward compatibility:** all schema additions default so existing rows behave exactly as today
  (`task_assignees.status='accepted'`, `proposals.status='draft'`). No backfill required.
- **RLS ↔ permissions lockstep:** each phase updates `usePermissions()`/gates and the matching RLS
  policy together (per the integration-plan principle). New gates likely needed:
  `canApproveProposal`, `canConvertProposal` (= admin/manager), `canRespondToAssignment` (assignee),
  `canLogHours` (accepted assignee).
- **Page access:** the new surfaces (approval controls, personal vs team workload) live behind the
  existing per-user page-access + role gates — no new nav gating mechanism needed.
- **Security:** the two guard triggers (assignment self-update scope, logged-hours attribution)
  mirror the existing `0009` role-guard pattern, so a crafted direct API call can't bypass the
  "coordinator can't log / only accepted assignees log" rule.
- **Migrations:** additive only; push with `npm run db:push`, regen `npm run db:types`. Each phase =
  one numbered migration continuing from `0014`.

---

## 9. Suggested sequencing & size

| Phase | Slice | Depends on | Size |
| --- | --- | --- | --- |
| A | Proposal approval → project | — | S–M |
| B | Assignment acceptance lifecycle | A (handoff) | **L** (core) |
| C | Hour logging + time entries | B | M |
| D | Workload: personal | C | M |
| E | Workload: team/admin | C, D | M |

---

_Last updated: 2026-07-02 — planning doc; confirm §3 decisions before Phase A. Maintainer: Frontend Dev._
