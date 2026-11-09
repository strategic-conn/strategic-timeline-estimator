import { expect, test } from "@playwright/test";

import { planSchedule, splitBookedWork, type PlanDev, type PlanTask } from "../lib/assignment/plan";
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
  expect(free.assigneeId).toBe("ann"); // negative control: a full tie (load too) goes by id
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
  // 40h at 8h/day is a working week of existing work (Mon 1 – Fri 5 March),
  // so this task starts the next Monday. It read 03-09 until 2026-10-27: every
  // calendar lost its first day (fixed in makeClock; timeline-stress.spec.ts).
  expect(booked.startDate! > unbooked.startDate!).toBe(true);
  expect(unbooked.startDate).toBe("2027-03-01");
  expect(booked.startDate).toBe("2027-03-08");
  expect(booked.reason).toContain("after 40h of work due now");
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
  // Booked work clears before the project starts: same finish, so the tie
  // goes to whoever carries less (bo), not by name (ann).
  const t = plan([dev("bo"), dev("ann", { bookedHours: 40 })], "quick", later);
  expect(t.assigneeId).toBe("bo");
  expect(t.endDate).toBe(plan([dev("ann", { bookedHours: 40 })], "quick", later).endDate);
  // Booked work overlaps the start: the free person wins.
  const soon = plan([dev("bo"), dev("ann", { bookedHours: 400 })], "quick", later);
  expect(soon.assigneeId).toBe("bo");
});

test.describe("booked work is split by due date", () => {
  test("overdue, due within 5 working days, or undated = now; the rest = later", () => {
    // Mon Mar 1 → the 5th working day after is Mon Mar 8.
    const split = splitBookedWork(
      [
        { estimated_hours: 4, due_date: "2027-02-20" }, // overdue
        { estimated_hours: 2, due_date: null }, // undated
        { estimated_hours: 3, due_date: "2027-03-08" }, // within 5 working days
        { estimated_hours: 10, due_date: "2027-03-09" }, // later
        { estimated_hours: 0, due_date: "2027-01-01" }, // no hours: ignored
      ],
      TODAY,
    );
    expect(split).toEqual({ now: 9, later: [{ hours: 10, due: "2027-03-09" }] });
  });

  test("work due later takes only its daily slice, not the whole calendar", () => {
    // 40 h due Fri Mar 12 = 10 working days → 4 h/day off an 8 h day.
    const spread = plan([dev("ann", { bookedLater: [{ hours: 40, due: "2027-03-12" }] })], "quick");
    expect([spread.startDate, spread.endDate]).toEqual(["2027-03-01", "2027-03-02"]);
    // The same 40 h due now blocks the first five days.
    const blocking = plan([dev("ann", { bookedHours: 40 })], "quick");
    expect(blocking.startDate).toBe("2027-03-08");
  });

  test("a day the spread fills completely is skipped, and capacity returns after the due date", () => {
    // 16 h due Tue Mar 2 = 2 working days at 8 h: both days full.
    const t = plan([dev("ann", { bookedLater: [{ hours: 16, due: "2027-03-02" }] })], "quick");
    expect([t.startDate, t.endDate]).toEqual(["2027-03-03", "2027-03-03"]);
  });

  test("Fastest picks the person whose work can wait", () => {
    const t = plan(
      [dev("ann", { bookedHours: 40 }), dev("bo", { bookedLater: [{ hours: 40, due: "2027-04-30" }] })],
      "quick",
    );
    expect(t.assigneeId).toBe("bo");
  });
});

test.describe("last tie-break is least load, not the name", () => {
  // Same stars, same finish: "ann" sorts first, so the old name rule picked her.
  // Later-due work (spread thin) leaves both finishing the same day.
  const due = "2027-06-30";
  const heavy = dev("ann", { skills: { WordPress: 5 }, bookedLater: [{ hours: 120, due }] });
  const light = dev("zed", { skills: { WordPress: 5 }, bookedLater: [{ hours: 9, due }] });

  for (const s of ["quick", "efficient"] as const) {
    test(`${s}: the lighter person wins a full tie`, () => {
      const a = plan([heavy, light], s);
      const b = plan([light, heavy], s);
      expect(a.endDate).toBe(plan([heavy], s).endDate); // the tie is real
      expect(a.endDate).toBe(plan([light], s).endDate);
      expect(a.assigneeId).toBe("zed");
      expect(b.assigneeId).toBe("zed"); // input order changes nothing
    });
  }

  test("work given earlier in the same plan counts as load", () => {
    const tasks: PlanTask[] = [
      { id: "t1", title: "One", phase: "development", hours: 8 },
      { id: "t2", title: "Two", phase: "development", hours: 8 },
    ];
    const out = planSchedule(tasks, [dev("ann"), dev("bo")], "wordpress", {
      strategy: "quick",
      projectStart: TODAY,
      today: TODAY,
    }).tasks;
    expect(new Set(out.map((t) => t.assigneeId))).toEqual(new Set(["ann", "bo"]));
  });
});
