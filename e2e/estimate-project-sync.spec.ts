import { expect, test } from "@playwright/test";

import {
  applyTaskToLineItems,
  diffEstimateToProject,
  poScheduleDrift,
  projectDateRange,
  removeLineItem,
} from "../lib/sync/estimate-project-sync";
import type { ProposalLineItem } from "../types/proposal.types";
import type { Task } from "../types/task.types";

/**
 * The estimate ↔ project reconciler. Pure — no browser, no network, no store.
 *
 * These exist because the old sync matched a task to a line item by TITLE and
 * only ever ADDED, so renaming a line item produced a duplicate task, deleting
 * one left its task behind forever, and changing its hours did nothing at all.
 */

const line = (over: Partial<ProposalLineItem> = {}): ProposalLineItem => ({
  id: "li-1",
  title: "Homepage",
  module: null,
  category_id: null,
  catalog_id: null,
  base_hours: 10,
  tier: "basic",
  quantity: 1,
  hours: 10,
  depends_on: [],
  ...over,
});

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t-1",
    title: "Homepage",
    status: "todo",
    priority: "medium",
    assignee_ids: [],
    assignees: [],
    reporter_id: "u-1",
    project_id: "p-1",
    sprint_id: null,
    estimated_hours: 10,
    tags: [],
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    comments: [],
    source_line_item_id: "li-1",
    ...over,
  }) as Task;

test.describe("diffEstimateToProject", () => {
  test("matched and unchanged = no work", () => {
    const d = diffEstimateToProject([line()], [task()], false);
    expect(d).toEqual({ create: [], update: [], remove: [], orphaned: [] });
  });

  test("a RENAMED line item updates its task instead of adding a second one", () => {
    const d = diffEstimateToProject(
      [line({ title: "Homepage v2" })],
      [task()],
      false,
    );
    expect(d.create).toHaveLength(0);
    expect(d.remove).toHaveLength(0);
    expect(d.update).toEqual([{ taskId: "t-1", title: "Homepage v2" }]);
  });

  test("changed hours reach the task", () => {
    const d = diffEstimateToProject(
      [line({ base_hours: 10, tier: "advanced" })],
      [task()],
      false,
    );
    expect(d.update).toEqual([{ taskId: "t-1", estimated_hours: 15 }]);
  });

  test("'requirements unclear' prices every line as Advanced", () => {
    const d = diffEstimateToProject([line()], [task()], true);
    expect(d.update).toEqual([{ taskId: "t-1", estimated_hours: 15 }]);
  });

  test("a DELETED line item removes its task", () => {
    const d = diffEstimateToProject([], [task()], false);
    expect(d.remove.map((t) => t.id)).toEqual(["t-1"]);
  });

  test("a hand-made task (no link) is never touched", () => {
    const hand = task({ id: "t-2", source_line_item_id: null, title: "Ad-hoc" });
    const d = diffEstimateToProject([], [hand], false);
    expect(d.remove).toHaveLength(0);
    expect(d.update).toHaveLength(0);
  });

  test("an unmatched line item is created", () => {
    const d = diffEstimateToProject([line({ id: "li-9" })], [], false);
    expect(d.create.map((l) => l.id)).toEqual(["li-9"]);
  });

  test("a task with LOGGED TIME is never deleted, only reported", () => {
    // `time_entries.task_id` is `on delete cascade` (0017), so deleting this
    // task would erase the record that somebody worked 6 hours — and per-person
    // hours come from exactly that table. Scoping a line out of a quote is not
    // permission to destroy that.
    const worked = task({ logged_hours: 6 });
    const d = diffEstimateToProject([], [worked], false);
    expect(d.remove, "must not be queued for deletion").toHaveLength(0);
    expect(d.orphaned.map((t) => t.id)).toEqual(["t-1"]);
  });

  test("zero logged hours is still safe to delete", () => {
    const d = diffEstimateToProject([], [task({ logged_hours: 0 })], false);
    expect(d.remove.map((t) => t.id)).toEqual(["t-1"]);
    expect(d.orphaned).toHaveLength(0);
  });
});

test.describe("applyTaskToLineItems", () => {
  test("new hours are written through base_hours, keeping the row consistent", () => {
    // 30h wanted on an Advanced (1.5x) line of quantity 2 → base 10.
    const next = applyTaskToLineItems(
      [line({ tier: "advanced", quantity: 2, base_hours: 5, hours: 15 })],
      "li-1",
      { estimated_hours: 30 },
      false,
    );
    expect(next?.[0].base_hours).toBe(10);
    expect(next?.[0].hours).toBe(30);
  });

  test("the round trip survives 'requirements unclear'", () => {
    // A Basic line is priced as Advanced when the quote is unclear, so 30h
    // wanted must divide by 1.5 — not by the row's own 1x.
    const next = applyTaskToLineItems([line()], "li-1", { estimated_hours: 30 }, true);
    expect(next?.[0].base_hours).toBe(20);
    // And reading it back the same way returns exactly what was asked for.
    const back = diffEstimateToProject(next!, [task({ estimated_hours: 30 })], true);
    expect(back.update).toHaveLength(0);
  });

  test("a no-op edit returns null so nothing is persisted", () => {
    expect(applyTaskToLineItems([line()], "li-1", { title: "Homepage" }, false)).toBeNull();
    expect(
      applyTaskToLineItems([line()], "li-1", { estimated_hours: 10 }, false),
    ).toBeNull();
    expect(applyTaskToLineItems([line()], "missing", { title: "x" }, false)).toBeNull();
  });

  test("removeLineItem drops it, and reports null when there was none", () => {
    expect(removeLineItem([line()], "li-1")).toEqual([]);
    expect(removeLineItem([line()], "li-9")).toBeNull();
  });
});

test.describe("PBS drift", () => {
  const sprints = [
    { start_date: "2026-09-04", end_date: "2026-10-01" },
    { start_date: "2026-10-02", end_date: "2026-12-10" },
  ];

  test("the project range spans every sprint", () => {
    expect(projectDateRange(sprints)).toEqual({
      start: "2026-09-04",
      end: "2026-12-10",
    });
    expect(projectDateRange([])).toBeNull();
  });

  test("matching dates are not drift", () => {
    expect(
      poScheduleDrift(
        { start_date: "2026-09-04", end_date: "2026-12-10" },
        projectDateRange(sprints),
      ),
    ).toBeNull();
  });

  test("a moved schedule is reported, since PBS cannot be updated", () => {
    const d = poScheduleDrift(
      { start_date: "2026-09-04", end_date: "2026-11-01" },
      projectDateRange(sprints),
    );
    expect(d?.billed.end).toBe("2026-11-01");
    expect(d?.actual.end).toBe("2026-12-10");
  });

  test("no PO dates, or no sprints, means nothing to report", () => {
    expect(poScheduleDrift(null, projectDateRange(sprints))).toBeNull();
    expect(poScheduleDrift({ start_date: "2026-09-04" }, projectDateRange(sprints))).toBeNull();
    expect(
      poScheduleDrift({ start_date: "2026-09-04", end_date: "2026-12-10" }, null),
    ).toBeNull();
  });
});
