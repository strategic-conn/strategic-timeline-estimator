/**
 * What one person is carrying, and how much room they have for it.
 *
 * One definition, shared by BOTH workload views, because they had drifted into
 * disagreeing about the same person in the same week:
 *
 *  - "Team" counted every assignee row (`assignee_ids`), so unaccepted work
 *    was in the utilisation bar; "Mine" counted only `accepted`. A dev with
 *    three pending assignments read 0 h on their own page while their manager
 *    read the full estimate on theirs.
 *  - "Team" subtracted time off from weekly capacity; "Mine" did not. Someone
 *    on three days' leave saw 40 h of capacity while their manager saw 16 h.
 *
 * Neither number was wrong on its own — they were answering different questions
 * without saying so, which is the failure mode CLAUDE.md's "one definition per
 * number, shared" rule exists to stop.
 */
import {
  type AwayEntryLike,
  awayWorkdaysInWeek,
  capacityAfterTimeOff,
  holidayWorkdaysInWeek,
} from "@/lib/constants/workload";
import { OPEN_TASK_STATUSES } from "@/lib/constants/task-status";
import { daysUntil, isOverdue } from "@/lib/utils/relative-dates";
import type { Task, TaskStatus } from "@/types/task.types";

export interface AssignedWork {
  /** Taken on: the person said yes. */
  accepted: Task[];
  /** Offered and not yet answered — still theirs to decline or pass. */
  pending: Task[];
  /**
   * accepted + pending. This is what "allocated to this person" means for
   * planning: a manager balancing a sprint cannot pretend unanswered work is
   * assigned to nobody, and the person needs to see the same figure their
   * manager is planning against.
   *
   * Rejected and passed assignments never appear — `respondToAssignment`
   * DELETES the row rather than storing a status, so they are gone from
   * `assignees` entirely.
   */
  allocated: Task[];
  acceptedHours: number;
  pendingHours: number;
  allocatedHours: number;
  /** Overdue among `allocated` — the tasks themselves, so a badge can list them. */
  overdueTasks: Task[];
  /** Count of `overdueTasks`. Derived in one place, so the two cannot disagree. */
  overdue: number;
}

/**
 * Projects whose work no longer counts toward anyone's load: `completed` or
 * `archived`. A finished project's leftover cards (never moved to Done) used
 * to sit in Workload, the dashboard and the assignment planner's "already
 * booked" hours for ever.
 */
/**
 * Share of finished tasks (with a due date) delivered on or before it, as a
 * whole percent; `null` when none qualify. One definition for the dashboard
 * tile and Reports, which had each computed it and disagreed.
 *
 * Measured from `completed_at` — when the task entered done (0047) — falling
 * back to `updated_at` only for a row that predates the column. `updated_at`
 * alone moved on every later edit, so finished work could turn "late" after
 * the fact. Calendar days, not instants (rule 8): `daysUntil(due, done) >= 0`.
 */
export function onTimePercent(tasks: Task[]): number | null {
  const done = tasks.filter((t) => t.status === "done" && t.due_date);
  if (done.length === 0) return null;
  const onTime = done.filter(
    (t) => daysUntil(t.due_date!, new Date(t.completed_at ?? t.updated_at)) >= 0,
  ).length;
  return Math.round((onTime / done.length) * 100);
}

export function closedProjectIds(
  projects: readonly { id: string; status: string }[],
): ReadonlySet<string> {
  return new Set(
    projects
      .filter((p) => p.status === "completed" || p.status === "archived")
      .map((p) => p.id),
  );
}

/**
 * A task counts as open until its status is `done` — or its project is closed
 * (`closedProjectIds`). `closed` is required, not optional, so a caller cannot
 * quietly forget it and count a finished project's leftovers.
 *
 * `in_review` and `blocked` still count: the work is not finished, and a
 * blocked task that vanished from someone's load would hide the very thing a
 * manager needs to see.
 */
export function isOpen(task: Task, closed: ReadonlySet<string>): boolean {
  return task.status !== "done" && !closed.has(task.project_id);
}

const sumHours = (tasks: Task[]): number =>
  Math.round(tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0) * 10) / 10;

export function assignedWork(
  tasks: Task[],
  memberId: string,
  opts: { projectId?: string; now: Date | number; closed: ReadonlySet<string> },
): AssignedWork {
  const { projectId, now, closed } = opts;
  const accepted: Task[] = [];
  const pending: Task[] = [];

  for (const t of tasks) {
    if (!isOpen(t, closed)) continue;
    if (projectId && projectId !== "all" && t.project_id !== projectId) continue;
    const mine = t.assignees.find((a) => a.profile_id === memberId);
    if (!mine) continue;
    if (mine.status === "accepted") accepted.push(t);
    else if (mine.status === "pending") pending.push(t);
  }

  const allocated = [...accepted, ...pending];
  const overdueTasks = allocated.filter((t) => isOverdue(t.due_date, now));
  return {
    accepted,
    pending,
    allocated,
    acceptedHours: sumHours(accepted),
    pendingHours: sumHours(pending),
    allocatedHours: sumHours(allocated),
    overdueTasks,
    overdue: overdueTasks.length,
  };
}

export interface MemberCapacity {
  /** What they are contracted for. */
  contracted: number;
  /** What is left after this week's time off AND holidays. */
  effective: number;
  /** Working days lost to this person's own leave. */
  awayDays: number;
  /** Working days lost to US holidays — everyone's, not theirs. */
  holidayDays: number;
}

export function capacityFor(
  contractedHours: number,
  entries: AwayEntryLike[],
  memberId: string,
  now: Date | number,
): MemberCapacity {
  // Reported apart, subtracted together. `awayWorkdaysInWeek` already skips
  // holidays, so a person on leave across Thanksgiving is not charged twice
  // for the Thursday.
  const awayDays = awayWorkdaysInWeek(entries, memberId, now);
  const holidayDays = holidayWorkdaysInWeek(now);
  return {
    contracted: contractedHours,
    effective: capacityAfterTimeOff(contractedHours, awayDays + holidayDays),
    awayDays,
    holidayDays,
  };
}

export interface Utilization {
  pct: number;
  /** Capped at 100 for the bar's width; `pct` keeps the true figure. */
  barPct: number;
  over: boolean;
}

/**
 * Load against capacity.
 *
 * Away all week leaves zero capacity. Open work against zero is not "0%
 * utilised" — it is work with nobody available to do it, so it reads as full
 * and over.
 */
export function utilization(hours: number, capacity: number): Utilization {
  const pct =
    capacity > 0 ? Math.round((hours / capacity) * 100) : hours > 0 ? 100 : 0;
  return { pct, barPct: Math.min(pct, 100), over: hours > capacity };
}

/** One status's share of a person's open load. */
export interface StatusSlice {
  status: TaskStatus;
  hours: number;
  count: number;
}

/**
 * A person's allocated hours split by task status, in workflow order.
 *
 * What the workload bar is made of: the same total the bar already measures
 * (`allocatedHours`), broken down so a full bar can say whether it is full of
 * work not started, work in flight, or work that is blocked — three very
 * different problems that all read as "100%" today.
 *
 * Only non-empty slices are returned, so a legend never lists a status nobody
 * has. `done` can never appear — a finished task is not open.
 */
export function statusBreakdown(tasks: Task[]): StatusSlice[] {
  const out: StatusSlice[] = [];
  for (const status of OPEN_TASK_STATUSES) {
    let hours = 0;
    let count = 0;
    for (const t of tasks) {
      if (t.status !== status) continue;
      hours += t.estimated_hours ?? 0;
      count += 1;
    }
    if (count > 0) {
      out.push({ status, hours: Math.round(hours * 10) / 10, count });
    }
  }
  return out;
}
