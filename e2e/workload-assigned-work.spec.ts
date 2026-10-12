import { expect, test } from "@playwright/test";

import {
  assignedWork,
  capacityFor,
  closedProjectIds,
  isOpen,
  onTimePercent,
  statusBreakdown,
  utilization,
} from "../lib/workload/assigned-work";
import type { Task, TaskAssignment } from "../types/task.types";

/**
 * The one definition both workload views compute from. Pure — no browser.
 *
 * These exist because "Mine" and "Team" had drifted into answering the same
 * question two ways: Team counted pending assignments in the utilisation bar
 * and subtracted time off from capacity; Mine did neither. The same person in
 * the same week read differently on their own page and their manager's.
 */
const NOW = new Date("2026-09-16T10:00:00");
/** No closed projects — the default case for every test that is not about them. */
const NONE: ReadonlySet<string> = new Set();

const assignee = (id: string, status: TaskAssignment["status"]): TaskAssignment => ({
  profile_id: id,
  status,
  assigned_by: "boss",
  responded_at: null,
  note: null,
});

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t-1",
    title: "Task",
    status: "todo",
    priority: "medium",
    assignees: [assignee("dev", "accepted")],
    assignee_ids: ["dev"],
    reporter_id: "boss",
    project_id: "p-1",
    sprint_id: null,
    estimated_hours: 8,
    tags: [],
    position: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    comments: [],
    ...over,
  }) as Task;

test.describe("what counts as open", () => {
  test("a task leaves the workload the moment it is Done", () => {
    expect(isOpen(task({ status: "todo" }), NONE)).toBe(true);
    expect(isOpen(task({ status: "in_progress" }), NONE)).toBe(true);
    // Still the person's work: unfinished, and a blocked task that vanished
    // from someone's load would hide the very thing a manager needs to see.
    expect(isOpen(task({ status: "in_review" }), NONE)).toBe(true);
    expect(isOpen(task({ status: "blocked" }), NONE)).toBe(true);
    expect(isOpen(task({ status: "done" }), NONE)).toBe(false);
  });

  test("a completed or archived project's leftovers are not open", () => {
    const closed = closedProjectIds([
      { id: "p-1", status: "completed" },
      { id: "p-2", status: "archived" },
      { id: "p-3", status: "active" },
    ]);
    expect([...closed].sort()).toEqual(["p-1", "p-2"]);
    expect(isOpen(task({ project_id: "p-1" }), closed)).toBe(false);
    expect(isOpen(task({ project_id: "p-2" }), closed)).toBe(false);
    expect(isOpen(task({ project_id: "p-3" }), closed)).toBe(true);
    // ...and so they leave the person's load and hours too.
    const w = assignedWork(
      [task({ project_id: "p-1" }), task({ id: "t-2", project_id: "p-3" })],
      "dev",
      { now: NOW, closed },
    );
    expect(w.allocated.map((t) => t.project_id)).toEqual(["p-3"]);
    expect(w.allocatedHours).toBe(8);
  });

  test("marking Done drops it out of both the count and the hours", () => {
    const before = assignedWork([task()], "dev", { now: NOW, closed: NONE });
    expect(before.allocated).toHaveLength(1);
    expect(before.allocatedHours).toBe(8);

    const after = assignedWork([task({ status: "done" })], "dev", { now: NOW, closed: NONE });
    expect(after.allocated).toHaveLength(0);
    expect(after.allocatedHours).toBe(0);
  });
});

test.describe("accepted vs pending", () => {
  test("accepted and pending are separated but both allocated", () => {
    const w = assignedWork(
      [
        task({ id: "a", estimated_hours: 8 }),
        task({
          id: "b",
          estimated_hours: 5,
          assignees: [assignee("dev", "pending")],
        }),
      ],
      "dev",
      { now: NOW, closed: NONE },
    );
    expect(w.accepted.map((t) => t.id)).toEqual(["a"]);
    expect(w.pending.map((t) => t.id)).toEqual(["b"]);
    expect(w.acceptedHours).toBe(8);
    expect(w.pendingHours).toBe(5);
    // The figure both pages now show — this is the disagreement that existed.
    expect(w.allocatedHours).toBe(13);
  });

  test("somebody else's task is not yours", () => {
    const w = assignedWork(
      [task({ assignees: [assignee("other", "accepted")], assignee_ids: ["other"] })],
      "dev",
      { now: NOW, closed: NONE },
    );
    expect(w.allocated).toHaveLength(0);
  });

  test("a declined assignment is gone entirely, not counted", () => {
    // respondToAssignment DELETES the row rather than storing "rejected", so
    // the assignee simply is not there any more.
    const w = assignedWork([task({ assignees: [], assignee_ids: [] })], "dev", {
      now: NOW,
      closed: NONE,
    });
    expect(w.allocated).toHaveLength(0);
  });

  test("the project filter narrows it, and 'all' does not", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", project_id: "p-2" })];
    expect(assignedWork(tasks, "dev", { now: NOW, closed: NONE, projectId: "p-2" }).allocated).toHaveLength(1);
    expect(assignedWork(tasks, "dev", { now: NOW, closed: NONE, projectId: "all" }).allocated).toHaveLength(2);
    expect(assignedWork(tasks, "dev", { now: NOW, closed: NONE }).allocated).toHaveLength(2);
  });
});

test.describe("capacity and utilisation", () => {
  const away = (start: string, end: string, kind: "pto" | "partial" = "pto") => ({
    user_id: "dev",
    start_date: start,
    end_date: end,
    kind,
  });

  test("time off comes off capacity — on BOTH pages now", () => {
    // Sept 14–18 2026 contains no federal holiday (Labor Day was the 7th).
    expect(capacityFor(40, [], "dev", NOW)).toEqual({
      contracted: 40,
      effective: 40,
      awayDays: 0,
      holidayDays: 0,
    });
    // Mon 14th – Wed 16th Sep 2026 = 3 workdays of the week containing NOW.
    const c = capacityFor(40, [away("2026-09-14", "2026-09-16")], "dev", NOW);
    expect(c.awayDays).toBe(3);
    expect(c.effective).toBe(16);
    expect(c.contracted).toBe(40);
  });

  test("a US holiday comes off the week too, and is reported separately", () => {
    // Thanksgiving 2026 is Thu Nov 26 — one day out of that week, for everyone.
    const c = capacityFor(40, [], "dev", new Date("2026-11-25T10:00:00"));
    expect(c.holidayDays).toBe(1);
    expect(c.awayDays, "a holiday is nobody's leave").toBe(0);
    expect(c.effective).toBe(32);
  });

  test("⚠️ leave across a holiday is not charged twice", () => {
    // Mon–Fri off over Thanksgiving week: the Thursday was already shut, so it
    // is 4 days of leave + 1 holiday, not 5 + 1. Six days out of a five-day
    // week would be nonsense, and would drive capacity negative.
    const c = capacityFor(
      40,
      [away("2026-11-23", "2026-11-27")],
      "dev",
      new Date("2026-11-25T10:00:00"),
    );
    expect(c.awayDays).toBe(4);
    expect(c.holidayDays).toBe(1);
    expect(c.effective).toBe(0);
  });

  test("someone else's leave does not touch your capacity", () => {
    const other = { ...away("2026-09-14", "2026-09-18"), user_id: "other" };
    expect(capacityFor(40, [other], "dev", NOW).effective).toBe(40);
  });

  test("utilisation, and the away-all-week edge", () => {
    expect(utilization(20, 40)).toEqual({ pct: 50, barPct: 50, over: false });
    expect(utilization(60, 40)).toEqual({ pct: 150, barPct: 100, over: true });
    // Zero capacity with work on it is not "0% utilised" — it is work with
    // nobody available to do it.
    expect(utilization(8, 0)).toEqual({ pct: 100, barPct: 100, over: true });
    expect(utilization(0, 0)).toEqual({ pct: 0, barPct: 0, over: false });
  });
});

test.describe("what the bar is made of", () => {
  test("splits allocated hours by status, in workflow order", () => {
    const slices = statusBreakdown([
      task({ id: "a", status: "blocked", estimated_hours: 3 }),
      task({ id: "b", status: "todo", estimated_hours: 5 }),
      task({ id: "c", status: "in_progress", estimated_hours: 2 }),
      task({ id: "d", status: "todo", estimated_hours: 1 }),
    ]);
    // Order is the workflow, not the order the tasks arrived in.
    expect(slices.map((s) => s.status)).toEqual(["todo", "in_progress", "blocked"]);
    expect(slices[0]).toEqual({ status: "todo", hours: 6, count: 2 });
    // The parts sum to the whole the bar measures: 6 todo + 2 in progress + 3
    // blocked. If these ever diverge the segments would not fill the fill.
    expect(slices.reduce((n, s) => n + s.hours, 0)).toBe(11);
  });

  test("a status nobody has is never a slice", () => {
    const slices = statusBreakdown([task({ status: "todo" })]);
    expect(slices).toHaveLength(1);
    expect(slices.map((s) => s.status)).not.toContain("in_review");
  });

  test("done can never be a segment", () => {
    // A finished task is not open, so it cannot be part of the load.
    expect(statusBreakdown([task({ status: "done", estimated_hours: 9 })])).toEqual([]);
  });

  test("tasks with no estimate still count, at zero hours", () => {
    const slices = statusBreakdown([task({ estimated_hours: undefined })]);
    expect(slices).toEqual([{ status: "todo", hours: 0, count: 1 }]);
  });

  test("nothing open means nothing to draw", () => {
    expect(statusBreakdown([])).toEqual([]);
  });
});

test.describe("on-time delivery", () => {
  test("measured from completed_at, not the last edit", () => {
    // Finished the day before it was due, renamed three weeks later.
    const done = task({
      status: "done",
      due_date: "2026-09-10",
      completed_at: "2026-09-09T15:00:00Z",
      updated_at: "2026-09-30T09:00:00Z",
    });
    expect(onTimePercent([done])).toBe(100);
    // A row from before 0047 has no completed_at: updated_at is all there is.
    expect(onTimePercent([{ ...done, completed_at: undefined }])).toBe(0);
    // Done ON the due day is on time (calendar days, rule 8).
    expect(
      onTimePercent([task({ status: "done", due_date: "2026-09-10", completed_at: "2026-09-10T22:00:00" })]),
    ).toBe(100);
    // Nothing finished with a due date: no figure, not 0%.
    expect(onTimePercent([task()])).toBeNull();
  });
});
