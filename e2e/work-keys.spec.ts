import { expect, test } from "@playwright/test";

import {
  planSchedule,
  type PlanDev,
  type PlanTask,
} from "../lib/assignment/plan";
import { buildRoster, parseWorkKeys } from "../lib/assignment/roster";
import { ptoImpact, type ImpactInput } from "../lib/availability/pto-impact";
import { parseRateKey, rateKey } from "../lib/pricing/hourly-rates";
import type { Task, TaskAssignment } from "../types/task.types";

/**
 * Work keys (pricing plan Phase 4). Pure — no browser, no store.
 *
 * Rule under test: where anyone holds a key in a task's discipline, keys decide
 * who is eligible (Level 2 may take Level 1, never the reverse) and skill stars
 * only break ties. A discipline nobody holds a key in keeps the skill-only rule
 * — which is every workspace until an admin sets keys, so that case must be
 * byte-identical to before.
 */

const START = new Date("2027-03-01T00:00:00"); // a Monday, no holiday that week
const IT1 = { responsible: "IT", level: 1 as const };
const IT2 = { responsible: "IT", level: 2 as const };
const CR1 = { responsible: "Creative", level: 1 as const };

const dev = (id: string, over: Partial<PlanDev> = {}): PlanDev => ({
  id,
  name: id,
  hoursPerDay: 8,
  skills: {},
  ...over,
});
const devTask = (id: string, role: PlanTask["role"], hours = 8): PlanTask => ({
  id,
  title: "Homepage build",
  phase: "development",
  hours,
  role,
});
const plan = (tasks: PlanTask[], devs: PlanDev[], strategy: "quick" | "efficient" = "efficient") =>
  planSchedule(tasks, devs, "wordpress", { strategy, projectStart: START });
const who = (r: ReturnType<typeof plan>, id: string) =>
  r.tasks.find((t) => t.taskId === id)!;

test("no keys anywhere: identical to the skill-only planner", () => {
  const devs = [
    dev("ann", { skills: { WordPress: 5, HTML: 5, "Quality Assurance": 3 } }),
    dev("bo", { skills: { WordPress: 2, HTML: 4 }, hoursPerDay: 4 }),
  ];
  const tasks: PlanTask[] = [
    devTask("a", IT2, 16),
    devTask("b", IT1, 6),
    { id: "c", title: "QA pass", phase: "qa", hours: 8, role: { responsible: "QA Tester", level: 1 } },
    { id: "d", title: "Wireframes", phase: "design", hours: 10, role: CR1 },
  ];
  const withoutRoles = tasks.map((t) => ({ ...t, role: undefined }));
  for (const strategy of ["quick", "efficient"] as const) {
    const expected = JSON.stringify(plan(withoutRoles, devs, strategy));
    expect(JSON.stringify(plan(tasks, devs, strategy))).toBe(expected);
    const emptyKeys = devs.map((d) => ({ ...d, keys: [] }));
    expect(JSON.stringify(plan(tasks, emptyKeys, strategy))).toBe(expected);
  }
});

test("a key beats stars: the key holder gets it, not the 5-star dev", () => {
  const r = plan(
    [devTask("t", IT1)],
    [
      dev("star", { skills: { WordPress: 5 } }),
      dev("kay", { skills: { WordPress: 1 }, keys: [IT1] }),
    ],
  );
  expect(who(r, "t").assigneeId).toBe("kay");
  expect(who(r, "t").reason).toContain("IT L1");
});

test("Level 2 may take Level 1 work", () => {
  const r = plan([devTask("t", IT1)], [dev("sen", { keys: [IT2] })]);
  expect(who(r, "t").assigneeId).toBe("sen");
});

test("Level 1 never takes Level 2 work — left for a human, with the reason", () => {
  const r = plan(
    [devTask("t", IT2)],
    [
      dev("jun", { skills: { WordPress: 5 }, keys: [IT1] }),
      // No key at all, but 5 stars: must NOT be the fallback once IT keys govern.
      dev("star", { skills: { WordPress: 5 } }),
    ],
  );
  expect(who(r, "t").assigneeId).toBeNull();
  expect(who(r, "t").reason).toBe("Nobody holds IT Level 2 — assign manually");
});

test("keys govern per discipline: a Creative key leaves IT on skills", () => {
  const devs = [
    dev("star", { skills: { WordPress: 5 } }),
    dev("des", { keys: [CR1] }),
  ];
  const design: PlanTask = { id: "d", title: "Wireframes", phase: "design", hours: 8, role: CR1 };
  const r = plan([devTask("t", IT1), design], devs);
  expect(who(r, "t").assigneeId).toBe("star"); // IT: nobody holds an IT key
  expect(who(r, "d").assigneeId).toBe("des"); // design now has an owner
  // Negative control: without the key, design is left for a human as before.
  const before = plan([design], [dev("star", { skills: { WordPress: 5 } }), dev("des")]);
  expect(who(before, "d").assigneeId).toBeNull();
});

test("among key holders, stars break the tie", () => {
  const r = plan(
    [devTask("t", IT1)],
    [
      dev("low", { skills: { WordPress: 2 }, keys: [IT1] }),
      dev("high", { skills: { WordPress: 4 }, keys: [IT1] }),
    ],
    "efficient",
  );
  expect(who(r, "t").assigneeId).toBe("high");
  expect(who(r, "t").reason).toContain("wordpress ★4");
});

test("roster: a key holder with no skills is kept; malformed keys are dropped", () => {
  const roster = buildRoster({
    members: [
      { id: "k", name: "Keyed", workKeys: ["Creative|Level 2", "junk", "IT|Level 3"] },
      { id: "n", name: "Nothing" },
    ],
    skillsByProfile: {},
    weeklyHours: {},
    defaultWeeklyHours: 40,
    ptoByProfile: {},
  });
  expect(roster.map((d) => d.id)).toEqual(["k"]);
  expect(roster[0].keys).toEqual([{ responsible: "Creative", level: 2 }]);
  expect(parseWorkKeys(undefined)).toEqual([]);
});

test("parseRateKey inverts rateKey and rejects anything else", () => {
  expect(parseRateKey(rateKey("QA Tester", 2))).toEqual({ responsible: "QA Tester", level: 2 });
  for (const bad of ["IT", "IT|Level 3", "|Level 1", "IT|level 1", ""]) {
    expect(parseRateKey(bad)).toBeNull();
  }
});

/* ── PTO cover ───────────────────────────────────────────────────────────── */

const assignee = (id: string): TaskAssignment => ({
  profile_id: id,
  status: "accepted",
  assigned_by: "boss",
  responded_at: null,
  note: null,
});
const seeded = (role: string | null): Task =>
  ({
    id: "t-1",
    title: "Hero banner",
    status: "todo",
    priority: "medium",
    assignees: [assignee("away")],
    assignee_ids: ["away"],
    reporter_id: "boss",
    project_id: "p-1",
    sprint_id: "s-1",
    due_date: "2027-03-03",
    estimated_hours: 8,
    tags: ["Design & UX"],
    source_line_item_id: role,
    position: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    comments: [],
  }) as Task;
const coverInput = (over: Partial<ImpactInput> = {}): ImpactInput => ({
  entry: { user_id: "away", start_date: "2027-03-01", end_date: "2027-03-05", kind: "pto" },
  tasks: [seeded("line-1")],
  sprints: [],
  members: [
    { id: "away", name: "Away", work_keys: ["Creative|Level 2"] },
    { id: "jr", name: "Junior", work_keys: ["Creative|Level 1"] },
    { id: "sr", name: "Senior", work_keys: ["Creative|Level 2"] },
    { id: "it", name: "Itzel", work_keys: ["IT|Level 2"] },
  ],
  skills: {},
  availability: [],
  roleByLineItem: { "line-1": { responsible: "Creative", level: 2 } },
  ...over,
});

test("cover follows the task's line role: only a Creative Level 2 is offered", () => {
  const cover = ptoImpact(coverInput()).affected[0].cover;
  expect(cover.map((c) => c.id)).toEqual(["sr"]);
  expect(cover[0].key).toBe("Creative L2");
});

test("cover: a hand-made task (no line) has no role and offers no key match", () => {
  const cover = ptoImpact(coverInput({ tasks: [seeded(null)] })).affected[0].cover;
  // Design has no skill tier, so with no role there is nothing honest to offer.
  expect(cover).toEqual([]);
});

test("cover: nobody holds the level → nobody offered, not a junior", () => {
  const cover = ptoImpact(
    coverInput({
      members: [
        { id: "away", name: "Away", work_keys: ["Creative|Level 2"] },
        { id: "jr", name: "Junior", work_keys: ["Creative|Level 1"] },
      ],
    }),
  ).affected[0].cover;
  expect(cover).toEqual([]);
});
