/**
 * Runnable self-check for the assignment engine — the 6 real devs as fixtures.
 * Compile with the project tsconfig (so `@/` type imports resolve) and run the
 * emitted JS with node. Asserts the invariants that matter; throws on failure.
 */
import { planSchedule, skillTiers, type PlanDev, type PlanTask } from "./plan";

let passed = 0;
function check(label: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
}

const DEVS: PlanDev[] = [
  {
    id: "francis",
    name: "Francis Jan",
    hoursPerDay: 8,
    skills: {
      HTML: 5, CSS: 5, JavaScript: 5, WordPress: 5,
      "Custom Plugin WordPress": 4, Shopify: 5, Wix: 5,
    },
  },
  {
    id: "martin",
    name: "Martin",
    hoursPerDay: 4,
    skills: {
      HTML: 5, CSS: 5, JavaScript: 5, WordPress: 5,
      "Custom Plugin WordPress": 5, PHP: 5, "InMotion Hosting": 5,
      "Domain Config": 5, "DNS Config": 5, "Next.js": 5, React: 5,
    },
  },
  {
    id: "arvin",
    name: "Arvin",
    hoursPerDay: 8,
    skills: { HTML: 5, CSS: 5, JavaScript: 5, WordPress: 4, Shopify: 4, Wix: 5 },
  },
  {
    id: "ronel",
    name: "Ronel",
    hoursPerDay: 8,
    skills: {
      HTML: 5, CSS: 5, JavaScript: 5, WordPress: 4, Shopify: 4, Wix: 5,
      "Quality Assurance": 5,
    },
  },
  {
    id: "daniel",
    name: "Daniel",
    hoursPerDay: 8,
    skills: {
      HTML: 5, CSS: 5, JavaScript: 5, WordPress: 5,
      "Custom Plugin WordPress": 3, Shopify: 5, "Next.js": 5, React: 5,
    },
  },
  { id: "patrick", name: "Patrick", hoursPerDay: 8, skills: { "Quality Assurance": 5 } },
];

const TASKS: PlanTask[] = [
  { id: "t-design", title: "Design & UX", phase: "design", hours: 20 },
  { id: "t-theme", title: "Storefront theme build", phase: "development", hours: 30 },
  { id: "t-products", title: "Product & collection pages", phase: "development", hours: 20 },
  { id: "t-cart", title: "Cart & checkout", phase: "development", hours: 16 },
  { id: "t-plugin", title: "Custom plugin for subscriptions", phase: "development", hours: 12 },
  { id: "t-live", title: "Go live / deploy to hosting", phase: "development", hours: 6 },
  { id: "t-qa", title: "QA & Testing", phase: "qa", hours: 16 },
];

const phaseStart = {
  design: "2026-08-03",
  development: "2026-08-10",
  qa: "2026-08-24",
} as const;
const projectStart = new Date("2026-08-03T00:00:00.000Z");

const byId = Object.fromEntries(DEVS.map((d) => [d.id, d]));
const has = (devId: string, skill: string) =>
  (byId[devId].skills[skill] ?? 0) > 0 ||
  Object.keys(byId[devId].skills).some(
    (k) => k.toLowerCase() === skill.toLowerCase(),
  );

for (const strategy of ["quick", "efficient"] as const) {
  const r = planSchedule(TASKS, DEVS, "shopify", { strategy, projectStart, phaseStart });
  const map = Object.fromEntries(r.tasks.map((t) => [t.taskId, t]));

  // 1. Invariant: every assignee actually has the matched skill.
  for (const t of r.tasks) {
    if (t.assigneeId) {
      check(
        `${strategy}: ${t.assigneeId} has ${t.matchedSkill} for ${t.taskId}`,
        !!t.matchedSkill && has(t.assigneeId, t.matchedSkill),
      );
    }
  }

  // 2. QA → a QA-skilled dev (Ronel or Patrick), never a non-QA dev.
  check(`${strategy}: QA to QA dev`, ["ronel", "patrick"].includes(map["t-qa"].assigneeId!));

  // 3. Shopify dev tasks never go to Martin (no Shopify) or Patrick (QA only).
  for (const id of ["t-theme", "t-products", "t-cart"]) {
    check(`${strategy}: ${id} not Martin`, map[id].assigneeId !== "martin");
    check(`${strategy}: ${id} not Patrick`, map[id].assigneeId !== "patrick");
  }

  // 4. "Go live" → InMotion Hosting → only Martin has it.
  check(`${strategy}: go-live to Martin`, map["t-live"].assigneeId === "martin");

  // 5. Custom plugin → a Custom-Plugin dev (Francis/Martin/Daniel).
  check(
    `${strategy}: plugin to plugin dev`,
    ["francis", "martin", "daniel"].includes(map["t-plugin"].assigneeId!),
  );

  // 6. Design → unassigned (no dev design skill) but time-reserved.
  check(`${strategy}: design unassigned`, map["t-design"].assigneeId === null);
  check(`${strategy}: design has dates`, !!map["t-design"].startDate);

  // 7. Phase gating: dev starts on/after its floor; qa after its floor.
  check(`${strategy}: dev after floor`, map["t-theme"].startDate! >= "2026-08-10");
  check(`${strategy}: qa after floor`, map["t-qa"].startDate! >= "2026-08-24");

  // 8. Capacity: 6h at Martin's 4h/day spans ≥ 2 calendar days.
  check(`${strategy}: martin go-live spans days`, map["t-live"].endDate! > map["t-live"].startDate!);
}

// 9. Efficient concentrates: never uses MORE distinct devs than quick spreads.
const q = planSchedule(TASKS, DEVS, "shopify", { strategy: "quick", projectStart, phaseStart });
const e = planSchedule(TASKS, DEVS, "shopify", { strategy: "efficient", projectStart, phaseStart });
const distinct = (r: ReturnType<typeof planSchedule>) =>
  new Set(r.tasks.map((t) => t.assigneeId).filter(Boolean)).size;
check("efficient ≤ quick distinct devs", distinct(e) <= distinct(q));

// 10. Quick finishes on or before efficient (spreading parallelizes).
check("quick finish ≤ efficient finish", q.finishDate! <= e.finishDate!);

// 11. Efficient prefers the top-skilled: plugin → Martin (5★) over Daniel (3★).
check("efficient plugin → Martin (5★)", e.tasks.find((t) => t.taskId === "t-plugin")!.assigneeId === "martin");

// 12. Regression: the timeline engine emits phase floors as "MMM d, yyyy".
// Those must not crash (Invalid Date → toISOString) and must yield ISO output.
const humanFloors = planSchedule(TASKS, DEVS, "shopify", {
  strategy: "efficient",
  projectStart,
  phaseStart: {
    design: "Aug 3, 2026",
    development: "Aug 10, 2026",
    qa: "Aug 24, 2026",
  },
});
check("human-format floors don't crash", humanFloors.tasks.length === TASKS.length);
check(
  "human-format floors yield ISO dates",
  humanFloors.tasks.every(
    (t) => !t.startDate || /^\d{4}-\d{2}-\d{2}$/.test(t.startDate),
  ),
);
check(
  "empty/invalid floor falls back (no throw)",
  planSchedule(TASKS, DEVS, "shopify", {
    strategy: "quick",
    phaseStart: { development: "" },
  }).tasks.length === TASKS.length,
);

// sanity on the mapper itself
check("tiers: qa → quality assurance", skillTiers(TASKS[6], "shopify")[0][0] === "quality assurance");
check("tiers: dev → shopify", skillTiers(TASKS[1], "shopify")[0][0] === "shopify");

console.log(`OK — ${passed} assertions passed`);
console.log("quick finish:", q.finishDate, "| efficient finish:", e.finishDate);
console.log(
  "efficient assignments:",
  e.tasks.map((t) => `${t.taskId}→${t.assigneeName ?? "—"}`).join(", "),
);
