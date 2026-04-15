import type { Sprint } from "@/types/sprint.types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const DUMMY_SPRINTS: Sprint[] = [
  // ── proj-1: Timeline Estimator ──────────────────────────
  {
    id: "sprint-1",
    project_id: "proj-1",
    name: "Sprint 1",
    goal: "Auth flow, design tokens, and core layout components",
    status: "completed",
    start_date: daysFromNow(-28),
    end_date: daysFromNow(-15),
    position: 0,
    created_at: daysFromNow(-30),
    updated_at: daysFromNow(-15),
  },
  {
    id: "sprint-2",
    project_id: "proj-1",
    name: "Sprint 2",
    goal: "Kanban board, task CRUD, and notification system",
    status: "active",
    start_date: daysFromNow(-14),
    end_date: daysFromNow(0),
    position: 1,
    created_at: daysFromNow(-15),
    updated_at: daysFromNow(-1),
  },
  {
    id: "sprint-3",
    project_id: "proj-1",
    name: "Sprint 3",
    goal: "Proposals, exports, accessibility audit",
    status: "planning",
    start_date: daysFromNow(1),
    end_date: daysFromNow(14),
    position: 2,
    created_at: daysFromNow(-5),
    updated_at: daysFromNow(-5),
  },

  // ── proj-2: Client Portal ──────────────────────────────
  {
    id: "sprint-4",
    project_id: "proj-2",
    name: "Sprint 1",
    goal: "Client login, milestone viewer, and proposal approval flow",
    status: "active",
    start_date: daysFromNow(-10),
    end_date: daysFromNow(4),
    position: 0,
    created_at: daysFromNow(-12),
    updated_at: daysFromNow(-2),
  },
  {
    id: "sprint-5",
    project_id: "proj-2",
    name: "Sprint 2",
    goal: "Delivery tracking dashboard and notifications",
    status: "planning",
    start_date: daysFromNow(5),
    end_date: daysFromNow(18),
    position: 1,
    created_at: daysFromNow(-5),
    updated_at: daysFromNow(-5),
  },

  // ── proj-3: Internal Tools (completed project — all sprints done) ─
  {
    id: "sprint-6",
    project_id: "proj-3",
    name: "Sprint 1",
    goal: "CI pipeline, linting, and release notes automation",
    status: "completed",
    start_date: daysFromNow(-90),
    end_date: daysFromNow(-76),
    position: 0,
    created_at: daysFromNow(-92),
    updated_at: daysFromNow(-76),
  },
  {
    id: "sprint-7",
    project_id: "proj-3",
    name: "Sprint 2",
    goal: "Admin workflows and developer tooling",
    status: "completed",
    start_date: daysFromNow(-75),
    end_date: daysFromNow(-61),
    position: 1,
    created_at: daysFromNow(-77),
    updated_at: daysFromNow(-61),
  },
];
