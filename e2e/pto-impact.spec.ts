import { expect, test } from "@playwright/test";

import {
  ptoImpact,
  reschedulePatches,
  workdaysInRange,
  type ImpactInput,
} from "../lib/availability/pto-impact";
import { countsAgainstCapacity } from "../lib/constants/workload";
import type { AvailabilityEntry } from "../types/availability.types";
import type { Sprint } from "../types/sprint.types";
import type { Task, TaskAssignment } from "../types/task.types";

/**
 * What an absence does to work already scheduled. Pure — no browser, no store.
 *
 * Mon 2027-03-01 → Fri 2027-03-05 is a clean full working week in a month with
 * NO federal holiday, which is why every fixture sits in it. They used to sit
 * in October 2026 and drifted by a day once holidays landed, because Columbus
 * Day is Mon 2026-10-12 — correct behaviour, but it made tests about an
 * absence quietly depend on a holiday.
 */
const assignee = (id: string, status: TaskAssignment["status"] = "accepted"): TaskAssignment => ({
  profile_id: id,
  status,
  assigned_by: "boss",
  responded_at: null,
  note: null,
});

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "t-1",
    title: "Homepage build",
    status: "todo",
    priority: "medium",
    assignees: [assignee("dev")],
    assignee_ids: ["dev"],
    reporter_id: "boss",
    project_id: "p-1",
    sprint_id: "s-1",
    due_date: "2027-03-03",
    estimated_hours: 12,
    tags: ["Development"],
    position: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    comments: [],
    ...over,
  }) as Task;

const sprint = (over: Partial<Sprint> = {}): Sprint =>
  ({
    id: "s-1",
    project_id: "p-1",
    name: "Development",
    status: "active",
    start_date: "2027-02-22",
    end_date: "2027-03-05",
    position: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as Sprint;

const base = (over: Partial<ImpactInput> = {}): ImpactInput => ({
  entry: {
    user_id: "dev",
    start_date: "2027-03-01",
    end_date: "2027-03-05",
    kind: "pto",
  },
  tasks: [task()],
  sprints: [sprint()],
  members: [
    { id: "dev", name: "Daniel" },
    { id: "sarah", name: "Sarah" },
    { id: "gone", name: "Departed", deactivated_at: "2026-01-01T00:00:00Z" },
  ],
  skills: {},
  availability: [],
  ...over,
});

test.describe("workdaysInRange", () => {
  test("counts Mon–Fri only", () => {
    expect(workdaysInRange("2027-03-01", "2027-03-05")).toBe(5);
    // A week plus its weekend is still five working days.
    expect(workdaysInRange("2027-03-01", "2027-03-07")).toBe(5);
    expect(workdaysInRange("2027-03-06", "2027-03-07")).toBe(0);
    expect(workdaysInRange("2027-03-03", "2027-03-03")).toBe(1);
  });
});

test.describe("what an absence threatens", () => {
  test("the slip is counted in working days, so a holiday is not a day of it", () => {
    // Thanksgiving is Thu 2026-11-26. Due the day before, away Wed-Fri: the
    // first free workday is Mon 30th. Counting the holiday as a workday used to
    // land this on Tue 1 Dec and report the slip a day too long.
    const i = ptoImpact(
      base({
        entry: {
          user_id: "dev",
          start_date: "2026-11-25",
          end_date: "2026-11-27",
          kind: "pto",
        },
        tasks: [task({ due_date: "2026-11-25" })],
        sprints: [sprint({ start_date: "2026-11-16", end_date: "2026-11-27" })],
      }),
    );
    expect(i.affected).toHaveLength(1);
    expect(i.affected[0].suggestedDue).toBe("2026-11-30");
  });

  test("a task due inside the absence is at risk and clears it", () => {
    const i = ptoImpact(base());
    expect(i.workdaysLost).toBe(5);
    expect(i.affected).toHaveLength(1);
    // Due Wed 3rd, away through Fri 5th → must land on Mon 8th at the earliest.
    expect(i.affected[0].suggestedDue).toBe("2027-03-08");
    expect(i.affected[0].hasCover).toBe(false);
    expect(i.uncoveredCount).toBe(1);
  });

  test("EVERY affected task clears the absence, not just the earliest", () => {
    // Shifting each by the same "days lost" would leave the Monday task inside
    // the absence. Each is measured to the day after it ends.
    const i = ptoImpact(
      base({
        tasks: [
          task({ id: "mon", due_date: "2027-03-01" }),
          task({ id: "fri", due_date: "2027-03-05" }),
        ],
      }),
    );
    for (const a of i.affected) {
      expect(a.suggestedDue > "2027-03-05", `${a.task.id} still inside`).toBe(true);
    }
    expect(i.affected.map((a) => a.suggestedDue)).toEqual([
      "2027-03-08",
      "2027-03-08",
    ]);
  });

  test("work outside the absence, done work, and other people's work are left alone", () => {
    const i = ptoImpact(
      base({
        tasks: [
          task({ id: "later", due_date: "2027-03-22" }),
          task({ id: "finished", status: "done" }),
          task({ id: "undated", due_date: undefined }),
          task({
            id: "someone-else",
            assignees: [assignee("sarah")],
            assignee_ids: ["sarah"],
          }),
        ],
      }),
    );
    expect(i.affected).toHaveLength(0);
    expect(i.sprintsAtRisk).toHaveLength(0);
  });

  test("⚠️ a rescheduled due date never lands on a holiday", () => {
    // Away Mon 23 – Wed 25 Nov 2026 with a task due inside it. The next working
    // day is NOT Thursday the 26th — that is Thanksgiving. `addBusinessDays`
    // only avoids weekends, so this used to hand somebody a deadline on a day
    // the office was shut.
    const i = ptoImpact(
      base({
        entry: {
          user_id: "dev",
          start_date: "2026-11-23",
          end_date: "2026-11-25",
          kind: "pto",
        },
        tasks: [task({ due_date: "2026-11-24" })],
        sprints: [sprint({ start_date: "2026-11-02", end_date: "2026-11-27" })],
      }),
    );
    expect(i.affected).toHaveLength(1);
    expect(i.affected[0].suggestedDue, "Thanksgiving").not.toBe("2026-11-26");
    expect(i.affected[0].suggestedDue).toBe("2026-11-27");
  });

  test("the absence itself costs fewer days when it spans a holiday", () => {
    // Mon–Fri off over Thanksgiving week is four working days, not five.
    const i = ptoImpact(
      base({
        entry: {
          user_id: "dev",
          start_date: "2026-11-23",
          end_date: "2026-11-27",
          kind: "pto",
        },
        tasks: [],
      }),
    );
    expect(i.workdaysLost).toBe(4);
  });

  test("a task the person has not answered yet still counts", () => {
    // Pending means it is on their plate; an approver needs to see it.
    const i = ptoImpact(
      base({ tasks: [task({ assignees: [assignee("dev", "pending")] })] }),
    );
    expect(i.affected).toHaveLength(1);
  });

  test("another accepted assignee IS the cover", () => {
    const i = ptoImpact(
      base({
        tasks: [
          task({
            assignees: [assignee("dev"), assignee("sarah")],
            assignee_ids: ["dev", "sarah"],
          }),
        ],
      }),
    );
    expect(i.affected[0].hasCover).toBe(true);
    expect(i.uncoveredCount).toBe(0);
    expect(i.affected[0].cover[0]).toMatchObject({
      name: "Sarah",
      alreadyOnTask: true,
    });
  });
});

test.describe("suggesting cover", () => {
  test("a skilled teammate is offered, via the assignment engine's own matcher", () => {
    const i = ptoImpact(
      base({
        skills: { sarah: [{ skill: "WordPress", confidence: 4 }] },
        platform: "wordpress",
      }),
    );
    expect(i.affected[0].cover).toEqual([
      { id: "sarah", name: "Sarah", confidence: 4, skill: "WordPress", key: null, alreadyOnTask: false },
    ]);
  });

  test("someone away over the same window is NOT offered as cover", () => {
    const i = ptoImpact(
      base({
        skills: { sarah: [{ skill: "WordPress", confidence: 5 }] },
        platform: "wordpress",
        availability: [
          {
            id: "a1",
            user_id: "sarah",
            start_date: "2027-03-03",
            end_date: "2027-03-04",
            kind: "pto",
            status: "approved",
          } as AvailabilityEntry,
        ],
      }),
    );
    expect(i.affected[0].cover).toHaveLength(0);
  });

  test("but a PENDING absence does not disqualify them — it may yet be refused", () => {
    const i = ptoImpact(
      base({
        skills: { sarah: [{ skill: "WordPress", confidence: 5 }] },
        platform: "wordpress",
        availability: [
          {
            id: "a1",
            user_id: "sarah",
            start_date: "2027-03-03",
            end_date: "2027-03-04",
            kind: "pto",
            status: "pending",
          } as AvailabilityEntry,
        ],
      }),
    );
    expect(countsAgainstCapacity({ status: "pending" })).toBe(false);
    expect(i.affected[0].cover.map((c) => c.name)).toEqual(["Sarah"]);
  });

  test("a deactivated member is never offered", () => {
    const i = ptoImpact(
      base({
        skills: { gone: [{ skill: "WordPress", confidence: 5 }] },
        platform: "wordpress",
      }),
    );
    expect(i.affected[0].cover).toHaveLength(0);
  });

  test("a hand-made task has no phase, so nothing is invented", () => {
    const i = ptoImpact(
      base({
        tasks: [task({ tags: [] })],
        skills: { sarah: [{ skill: "WordPress", confidence: 5 }] },
      }),
    );
    expect(i.affected[0].cover).toHaveLength(0);
  });
});

test.describe("sprints and the write set", () => {
  test("a sprint whose work now finishes after it ends is flagged", () => {
    const i = ptoImpact(base());
    expect(i.sprintsAtRisk).toHaveLength(1);
    expect(i.sprintsAtRisk[0].currentEnd).toBe("2027-03-05");
    expect(i.sprintsAtRisk[0].suggestedEnd).toBe("2027-03-08");
  });

  test("a sprint with room to absorb the slip is NOT flagged", () => {
    const i = ptoImpact(base({ sprints: [sprint({ end_date: "2027-03-30" })] }));
    expect(i.sprintsAtRisk).toHaveLength(0);
  });

  test("the patches are exactly what the preview showed", () => {
    const i = ptoImpact(base());
    expect(reschedulePatches(i)).toEqual({
      tasks: [{ id: "t-1", due_date: "2027-03-08" }],
      sprints: [{ id: "s-1", end_date: "2027-03-08" }],
    });
  });

  test("nothing affected means nothing to write", () => {
    const i = ptoImpact(base({ tasks: [] }));
    expect(reschedulePatches(i)).toEqual({ tasks: [], sprints: [] });
  });
});
