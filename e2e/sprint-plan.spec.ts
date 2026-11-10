import { expect, test } from "@playwright/test";

import { planSprints, type PlanDev, type PlanTask } from "../lib/assignment/plan";

/**
 * Sprint planning (2026-11-09): Sprint 0 ends in client gates, build tasks are
 * tested the day after they are built inside two-week sprints, and Launch &
 * Handoff starts with the client's acceptance testing. Pure — no browser.
 *
 * Mon 2027-03-01 is the start; March 2027 has no federal holiday.
 */
const START = new Date("2027-03-01T00:00:00");
const dev = (id: string, over: Partial<PlanDev> = {}): PlanDev => ({
  id,
  name: id,
  hoursPerDay: 8,
  skills: { WordPress: 5 },
  ...over,
});
const ann = dev("ann");
const tess = dev("tess", { skills: { "Quality Assurance": 5 } });
const t = (id: string, phase: PlanTask["phase"], hours: number, after?: string): PlanTask => ({
  id,
  title: id,
  phase,
  hours,
  after,
});
const plan = (tasks: PlanTask[], over: Partial<Parameters<typeof planSprints>[3]> = {}) =>
  planSprints(tasks, [ann, tess], "wordpress", {
    strategy: "efficient",
    projectStart: START,
    today: START,
    reviewDays: 3,
    phaseDays: { design: 2, launch: 2 },
    ...over,
  });
const cp = (r: ReturnType<typeof plan>, id: string) => r.checkpoints.find((c) => c.id === id)!;
const task = (r: ReturnType<typeof plan>, id: string) => r.tasks.find((x) => x.taskId === id)!;

test("the whole chain: sign-off → design → approval → build + test → UAT → launch", () => {
  const r = plan([
    t("kickoff", "discovery", 6),
    t("build", "development", 40),
    t("test:build", "qa", 8, "build"),
  ]);
  // Discovery: one day (unassigned work is reserved at 6 h/day).
  expect(task(r, "kickoff")).toMatchObject({ startDate: "2027-03-01", endDate: "2027-03-01" });
  // The client signs off over the next 3 working days.
  expect(cp(r, "cp-signoff")).toMatchObject({ start: "2027-03-02", end: "2027-03-04", blocks: "Design" });
  // Design (no tasks: its 2 reserved days), then the client approves it.
  expect(r.reserved.find((b) => b.phase === "design")).toMatchObject({ start: "2027-03-05", end: "2027-03-08" });
  expect(cp(r, "cp-design")).toMatchObject({ start: "2027-03-09", end: "2027-03-11", blocks: "Development" });
  // Nothing is built before design approval.
  expect(task(r, "build")).toMatchObject({ assigneeId: "ann", startDate: "2027-03-12", endDate: "2027-03-18" });
  // Tested the next working day, by the tester, in the same sprint.
  expect(task(r, "test:build")).toMatchObject({ assigneeId: "tess", startDate: "2027-03-19", endDate: "2027-03-19" });
  expect(r.sprintOf.get("build")).toBe("Sprint 1");
  expect(r.sprintOf.get("test:build")).toBe("Sprint 1");
  // The last sprint ends with its work; the client then reviews it for the
  // full review time, and acceptance testing waits for that review.
  expect(r.sprints.map((s) => [s.label, s.start, s.end])).toEqual([
    ["Sprint 0 · Discovery & Design", "2027-03-01", "2027-03-11"],
    ["Sprint 1", "2027-03-12", "2027-03-19"],
    ["Launch & Handoff", "2027-03-25", "2027-03-31"],
  ]);
  expect(cp(r, "cp-review-1")).toMatchObject({
    start: "2027-03-22",
    end: "2027-03-24",
    blocks: "Acceptance testing",
  });
  // Acceptance testing, go-live approval, then the launch's reserved days.
  expect(cp(r, "cp-uat")).toMatchObject({ start: "2027-03-25", end: "2027-03-29", blocks: "Launch" });
  expect(cp(r, "cp-golive")).toMatchObject({ start: "2027-03-29", end: "2027-03-29" });
  expect(r.reserved.find((b) => b.phase === "launch")).toMatchObject({ start: "2027-03-30", end: "2027-03-31" });
  expect(r.finishDate).toBe("2027-03-31");
});

test("a test starts the day after ITS build task, not after all development", () => {
  // Two developers, so the small task is built while the big one is still going.
  const r = planSprints(
    [
      t("small", "development", 8),
      t("big", "development", 80),
      t("test:small", "qa", 4, "small"),
      t("test:big", "qa", 4, "big"),
    ],
    [ann, dev("bo"), tess],
    "wordpress",
    { strategy: "quick", projectStart: START, today: START, reviewDays: 3 },
  );
  const small = task(r, "small");
  const big = task(r, "big");
  expect(task(r, "test:small").startDate! > small.endDate!).toBe(true);
  // Tested long before the big task is finished.
  expect(task(r, "test:small").endDate! < big.endDate!).toBe(true);
  expect(task(r, "test:big").startDate! > big.endDate!).toBe(true);
});

test("work spanning more than two weeks runs over several sprints", () => {
  // Two 80 h build tasks on one developer: four weeks of work.
  const r = plan([t("a", "development", 80), t("b", "development", 80)], { phaseDays: {} });
  // Sprint 2 starts after the client's 3-day review of Sprint 1 (Mar 15–17).
  expect(r.sprints.filter((s) => s.kind === "build").map((s) => [s.label, s.start, s.end])).toEqual([
    ["Sprint 1", "2027-03-01", "2027-03-12"],
    ["Sprint 2", "2027-03-18", "2027-03-31"],
  ]);
  expect(new Set([r.sprintOf.get("a"), r.sprintOf.get("b")])).toEqual(new Set(["Sprint 1", "Sprint 2"]));
  expect(r.checkpoints.filter((c) => c.kind === "review").map((c) => [c.start, c.end, c.blocks])).toEqual([
    ["2027-03-15", "2027-03-17", "Sprint 2"],
    ["2027-04-01", "2027-04-05", "Acceptance testing"],
  ]);
  // No build work lands on a review day.
  for (const x of r.tasks) expect(x.startDate! > "2027-03-17" || x.endDate! < "2027-03-15").toBe(true);
});

test("no discovery or design: building starts on day one, with no sign-off", () => {
  const r = plan([t("build", "development", 8)], { phaseDays: {} });
  expect(r.sprints[0].label).toBe("Sprint 1");
  expect(task(r, "build").startDate).toBe("2027-03-01");
  expect(r.checkpoints.map((c) => c.kind)).toEqual(["review", "uat", "golive"]);
});

test("review time 0: same-day sign-off, work resumes the next working day", () => {
  const r = plan([t("kickoff", "discovery", 6), t("build", "development", 8)], {
    reviewDays: 0,
    phaseDays: {},
  });
  expect(cp(r, "cp-signoff")).toMatchObject({ start: "2027-03-01", end: "2027-03-01" });
  expect(task(r, "build").startDate).toBe("2027-03-02");
});

test("client review days skip weekends and federal holidays", () => {
  // Discovery ends Wed 2026-11-10; Thu 11 is Veterans Day.
  const r = plan([t("kickoff", "discovery", 12), t("build", "development", 8)], {
    projectStart: new Date("2026-11-09T00:00:00"),
    today: new Date("2026-11-09T00:00:00"),
    phaseDays: {},
  });
  expect(task(r, "kickoff").endDate).toBe("2026-11-10");
  expect(cp(r, "cp-signoff")).toMatchObject({ start: "2026-11-12", end: "2026-11-16" });
  expect(task(r, "build").startDate).toBe("2026-11-17");
});

test("deterministic", () => {
  const tasks = [
    t("kickoff", "discovery", 6),
    t("a", "development", 30),
    t("b", "development", 12),
    t("test:a", "qa", 3, "a"),
    t("test:b", "qa", 1, "b"),
    t("go-live", "launch", 4),
  ];
  const a = plan(tasks);
  const b = plan(tasks);
  expect(JSON.stringify({ ...a, sprintOf: [...a.sprintOf] })).toBe(
    JSON.stringify({ ...b, sprintOf: [...b.sprintOf] }),
  );
  // Launch work sits in Launch & Handoff, after the go-live approval.
  expect(a.sprintOf.get("go-live")).toBe("Launch & Handoff");
  expect(task(a, "go-live").startDate! > cp(a, "cp-golive").end).toBe(true);
});

test("sprint length follows the workspace setting (1 week = 5 working days)", () => {
  const r = plan([t("a", "development", 80)], { phaseDays: {}, sprintDays: 5 });
  // A task longer than a sprint pauses for the review (Mar 8–10) and resumes.
  expect(r.sprints.filter((s) => s.kind === "build").map((s) => [s.label, s.start, s.end])).toEqual([
    ["Sprint 1", "2027-03-01", "2027-03-05"],
    ["Sprint 2", "2027-03-11", "2027-03-17"],
  ]);
  expect(task(r, "a")).toMatchObject({ startDate: "2027-03-01", endDate: "2027-03-17" });
  // Shorter sprints = one more client review = a later launch than 2-week sprints.
  const twoWeeks = plan([t("a", "development", 80)], { phaseDays: {} });
  expect(r.finishDate! > twoWeeks.finishDate!).toBe(true);
});

test("review time 0: sprints run back to back", () => {
  const r = plan([t("a", "development", 160)], { phaseDays: {}, reviewDays: 0 });
  expect(r.sprints.filter((s) => s.kind === "build").map((s) => [s.start, s.end])).toEqual([
    ["2027-03-01", "2027-03-12"],
    ["2027-03-15", "2027-03-26"],
  ]);
});
