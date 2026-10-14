/**
 * Sprint velocity, the forecast built on it, and a sprint's burndown.
 *
 * One definition for every screen that shows them (project overview, Reports),
 * measured in the unit the app already plans in — ESTIMATED HOURS, not story
 * points. Pure: no stores, no clock of its own, so it is testable both ways
 * (`e2e/velocity.spec.ts`).
 *
 *  - **Committed** — estimated hours of the tasks in the sprint.
 *  - **Completed** — estimated hours of those tasks finished BY the sprint's
 *    last day (calendar days, rule 8). Work finished after the sprint ended is
 *    real work, but it is not what the sprint delivered, and counting it would
 *    make a late sprint look as fast as an on-time one.
 *  - **Velocity** — the average Completed of the last few ENDED sprints. An
 *    unfinished sprint would drag the average down with work still in flight.
 *
 * "Finished" is `completed_at` (0047), falling back to `updated_at` for a row
 * that predates the column — the same rule as on-time delivery.
 */
import { addDays, isWeekend } from "date-fns";

import { isUsHoliday } from "@/lib/calendar/us-holidays";
import { addWorkingDays, type TeamCalendar } from "@/lib/discovery/team-calendar";
import { formatYmdLocal, parseYmdLocal } from "@/lib/utils/availability-dates";
import { daysUntil } from "@/lib/utils/relative-dates";
import type { Sprint } from "@/types/sprint.types";
import type { Task } from "@/types/task.types";

/** How many ended sprints the average looks back over. */
export const VELOCITY_WINDOW = 3;

type SprintLike = Pick<Sprint, "id" | "name" | "status" | "start_date" | "end_date">;
type TaskLike = Pick<
  Task,
  "sprint_id" | "status" | "estimated_hours" | "completed_at" | "updated_at"
>;

const hours = (t: TaskLike) => t.estimated_hours ?? 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The calendar day a done task was finished, or null if it isn't done. */
export function finishedOn(t: TaskLike): string | null {
  if (t.status !== "done") return null;
  return formatYmdLocal(new Date(t.completed_at ?? t.updated_at));
}

export interface SprintVelocity {
  sprint: SprintLike;
  committed: number;
  completed: number;
  /** The sprint's last day is before today. */
  ended: boolean;
  /** Done tasks with no estimate — they count as 0 h, so the figure is low. */
  unestimatedDone: number;
}

export function sprintVelocity(
  sprint: SprintLike,
  tasks: readonly TaskLike[],
  now: Date | number,
): SprintVelocity {
  const mine = tasks.filter((t) => t.sprint_id === sprint.id);
  let completed = 0;
  let unestimatedDone = 0;
  for (const t of mine) {
    const day = finishedOn(t);
    if (!day) continue;
    if (!t.estimated_hours) unestimatedDone += 1;
    // On or before the sprint's last day, by calendar day.
    if (daysUntil(sprint.end_date, parseYmdLocal(day)) >= 0) completed += hours(t);
  }
  return {
    sprint,
    committed: round1(mine.reduce((s, t) => s + hours(t), 0)),
    completed: round1(completed),
    ended: daysUntil(sprint.end_date, now) < 0,
    unestimatedDone,
  };
}

export interface ProjectVelocity {
  /** Every sprint except cancelled ones, in date order. */
  rows: SprintVelocity[];
  /** The ended sprints the average is taken over (most recent last). */
  basis: SprintVelocity[];
  /** Average completed hours per sprint; null until a sprint has ended. */
  average: number | null;
  /** Estimated hours of the project's tasks that are not done (backlog included). */
  remaining: number;
  forecast: {
    sprints: number;
    /** ISO date the remaining work would finish at the current pace. */
    finish: string;
  } | null;
}

/**
 * Velocity for one project. `tasks` and `sprints` may be the whole workspace;
 * both are filtered to the project here.
 */
export function projectVelocity(
  projectId: string,
  sprints: readonly (SprintLike & { project_id: string })[],
  tasks: readonly (TaskLike & { project_id: string })[],
  now: Date | number,
  cal?: TeamCalendar | null,
): ProjectVelocity {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  const rows = sprints
    .filter((s) => s.project_id === projectId && s.status !== "cancelled")
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date))
    .map((s) => sprintVelocity(s, projectTasks, now));

  // Ended sprints that had something in them — an empty sprint says nothing
  // about the team's pace.
  const basis = rows
    .filter((r) => r.ended && r.committed > 0)
    .sort((a, b) => a.sprint.end_date.localeCompare(b.sprint.end_date))
    .slice(-VELOCITY_WINDOW);

  const average = basis.length
    ? round1(basis.reduce((s, r) => s + r.completed, 0) / basis.length)
    : null;

  const remaining = round1(
    projectTasks.filter((t) => t.status !== "done").reduce((s, t) => s + hours(t), 0),
  );

  let forecast: ProjectVelocity["forecast"] = null;
  if (average && average > 0 && remaining > 0) {
    const sprintsNeeded = Math.ceil(remaining / average);
    // A "sprint" here is as long as the sprints the pace was measured over.
    const avgLength = Math.max(
      1,
      Math.round(
        basis.reduce((s, r) => s + workdaysIn(r.sprint.start_date, r.sprint.end_date).length, 0) /
          basis.length,
      ),
    );
    const finish = addWorkingDays(new Date(now), sprintsNeeded * avgLength, cal);
    forecast = { sprints: sprintsNeeded, finish: formatYmdLocal(finish) };
  }

  return { rows, basis, average, remaining, forecast };
}

/** Working days (no weekends, no US holidays) from start to end, inclusive. */
export function workdaysIn(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  if (!startYmd || !endYmd || endYmd < startYmd) return out;
  let d = parseYmdLocal(startYmd);
  const last = parseYmdLocal(endYmd);
  // ponytail: bounded walk — a sprint longer than ~2 years is a typo, not a plan.
  for (let i = 0; d <= last && i < 800; i++, d = addDays(d, 1)) {
    const ymd = formatYmdLocal(d);
    if (!isWeekend(d) && !isUsHoliday(ymd)) out.push(ymd);
  }
  return out;
}

export interface BurndownPoint {
  day: string;
  /** Straight line from everything committed to zero on the last day. */
  ideal: number;
  /** Hours not yet finished at the end of that day; null for days still to come. */
  remaining: number | null;
}

/**
 * Hours left in a sprint, working day by working day, against the ideal line.
 *
 * ponytail: "committed" is the sprint's tasks as they are NOW — the app keeps no
 * history of when a task joined a sprint, so work added mid-sprint is drawn as
 * if it had been there from the start. A scope-change line needs that history.
 */
export function burndown(
  sprint: SprintLike,
  tasks: readonly TaskLike[],
  now: Date | number,
): BurndownPoint[] {
  const mine = tasks.filter((t) => t.sprint_id === sprint.id);
  const committed = mine.reduce((s, t) => s + hours(t), 0);
  const days = workdaysIn(sprint.start_date, sprint.end_date);
  if (!days.length) return [];
  const today = formatYmdLocal(new Date(now));
  const span = Math.max(1, days.length - 1);
  return days.map((day, i) => {
    const done = mine
      .filter((t) => {
        const f = finishedOn(t);
        return f != null && f <= day;
      })
      .reduce((s, t) => s + hours(t), 0);
    return {
      day,
      ideal: round1(committed * (1 - i / span)),
      remaining: day <= today ? round1(committed - done) : null,
    };
  });
}
