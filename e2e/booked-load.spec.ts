import { expect, test } from "@playwright/test";

import { planSchedule, type PlanDev, type PlanTask } from "../lib/assignment/plan";
import { buildRoster } from "../lib/assignment/roster";

/**
 * The planner counts work people ALREADY have (accepted + pending, across all
 * projects) before giving them more. Pure — no browser.
 *
 * Mon 2027-03-01 is "today" and the project start; that week and the next have
 * no federal holiday, so day counts are exact.
 */
const TODAY = new Date("2027-03-01T00:00:00");
const dev = (id: string, over: Partial<PlanDev> = {}): PlanDev => ({
  id,
  name: id,
  hoursPerDay: 8,
  skills: { WordPress: 3 },
  ...over,
});
const task: PlanTask = { id: "t", title: "Homepage build", phase: "development", hours: 8 };
const plan = (devs: PlanDev[], strategy: "quick" | "efficient", start = TODAY) =>
  planSchedule([task], devs, "wordpress", { strategy, projectStart: start, today: TODAY }).tasks[0];

test("nobody booked: identical to the planner before this change", () => {
  const devs = [dev("ann", { skills: { WordPress: 5 } }), dev("bo")];
  for (const s of ["quick", "efficient"] as const) {
    const before = plan(devs, s);
    expect(plan(devs.map((d) => ({ ...d, bookedHours: 0 })), s)).toEqual(before);
  }
});

test("Fastest sends the work to whoever is actually free", () => {
  const free = plan([dev("ann"), dev("bo")], "quick");
  expect(free.assigneeId).toBe("ann"); // negative control: a tie goes by name
  const busy = plan([dev("ann", { bookedHours: 40 }), dev("bo")], "quick");
  expect(busy.assigneeId).toBe("bo");
});

test("Best-fit keeps the strongest person, with honest dates", () => {
  const unbooked = plan([dev("ann", { skills: { WordPress: 5 } }), dev("bo")], "efficient");
  const booked = plan(
    [dev("ann", { skills: { WordPress: 5 }, bookedHours: 40 }), dev("bo")],
    "efficient",
  );
  expect(booked.assigneeId).toBe("ann");
  // 40h at 8h/day is a working week of existing work before this task starts.
  expect(booked.startDate! > unbooked.startDate!).toBe(true);
  expect(booked.startDate).toBe("2027-03-09");
  expect(booked.reason).toContain("after 40h already booked");
  expect(unbooked.reason).not.toContain("booked");
});

test("a project starting after the booked work clears is not delayed by it", () => {
  const later = new Date("2027-04-05T00:00:00");
  const devs = [dev("ann", { skills: { WordPress: 5 } })];
  expect(plan([{ ...devs[0], bookedHours: 40 }], "efficient", later).startDate).toBe(
    plan(devs, "efficient", later).startDate,
  );
});

test("roster carries booked hours through", () => {
  const roster = buildRoster({
    members: [{ id: "a", name: "A" }],
    skillsByProfile: { a: [{ skill: "WordPress", confidence: 3 }] },
    weeklyHours: {},
    defaultWeeklyHours: 40,
    ptoByProfile: {},
    bookedHours: { a: 131 },
  });
  expect(roster[0].bookedHours).toBe(131);
});

test("a busy person never looks more available than a free one", () => {
  const later = new Date("2027-04-05T00:00:00");
  // Booked work clears before the project starts: a tie, broken by name (ann).
  const t = plan([dev("bo"), dev("ann", { bookedHours: 40 })], "quick", later);
  expect(t.assigneeId).toBe("ann");
  // Booked work overlaps the start: the free person wins.
  const soon = plan([dev("bo"), dev("ann", { bookedHours: 400 })], "quick", later);
  expect(soon.assigneeId).toBe("bo");
});
