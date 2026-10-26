import { expect, test } from "@playwright/test";
import { addDays, format, parse, parseISO } from "date-fns";

import {
  holdsKeyFor,
  keysGovern,
  planSchedule,
  type PlanDev,
  type PlanStrategy,
  type PlanTask,
  type WorkKey,
} from "../lib/assignment/plan";
import { isUsHoliday } from "../lib/calendar/us-holidays";
import { analyzeDiscovery } from "../lib/discovery";
import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { addWorkingDays, buildTeamCalendar } from "../lib/discovery/team-calendar";
import type { DiscoveryProject, PhaseId } from "../types/discovery.types";

/**
 * STRESS AUDIT of the timeline generator and the assignment planner
 * (2026-10-27). Thousands of seeded random scenarios — teams, work keys,
 * skills, hours per day, approved leave, existing workload, start dates around
 * Thanksgiving / Christmas / New Year and on weekends — through BOTH
 * strategies, checking on every task:
 *
 *  - nobody works a weekend, a US federal holiday or their own approved leave;
 *  - nobody is double-booked (a person's tasks never overlap);
 *  - no unexplained gaps inside a task (it takes the days its hours need);
 *  - existing workload is done first, and nobody idles once it is;
 *  - a Level 2 task never goes to a Level 1 (work keys);
 *  - phases stay in order (QA after development, and so on);
 *  - the same input always gives the same plan.
 *
 * And for the tentative timeline: every phase date is a working day, phases
 * follow each other, and booked leave never lands a phase on a day nobody works.
 * Pure — no browser, no database. A failure prints the seed to replay.
 */

// ── seeded randomness ──
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const day = (s: string) => parseISO(s);
const isWeekend = (s: string) => {
  const g = day(s).getDay();
  return g === 0 || g === 6;
};
const isWorkdayFor = (s: string, pto: Set<string>) => !isWeekend(s) && !isUsHoliday(s) && !pto.has(s);
function workdaysBetween(a: string, b: string, pto: Set<string>): number {
  let n = 0;
  for (let d = day(a); ymd(d) <= b; d = addDays(d, 1)) if (isWorkdayFor(ymd(d), pto)) n += 1;
  return n;
}
function nextWorkday(s: string, pto: Set<string>): string {
  let d = day(s);
  while (!isWorkdayFor(ymd(d), pto)) d = addDays(d, 1);
  return ymd(d);
}

// Start dates that stress holidays and weekends.
const START_POOL = [
  "2026-11-02", "2026-11-11", "2026-11-23", "2026-11-26", "2026-11-28",
  "2026-12-21", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31",
  "2027-01-01", "2027-01-15", "2027-01-18", "2027-02-15", "2027-05-31",
  "2027-07-02", "2027-07-05", "2027-12-31", "2026-10-31", "2027-03-03",
];

const ROLES: (WorkKey & { phase: PhaseId })[] = [
  { responsible: "IT", level: 1, phase: "development" },
  { responsible: "IT", level: 2, phase: "development" },
  { responsible: "QA Tester", level: 1, phase: "qa" },
  { responsible: "Creative", level: 1, phase: "design" },
  { responsible: "Creative", level: 2, phase: "design" },
];

function scenario(seed: number) {
  const r = rng(seed);
  const start = pick(r, START_POOL);
  const startDate = day(start);
  const devs: PlanDev[] = Array.from({ length: int(r, 1, 6) }, (_, i) => {
    const keys: WorkKey[] = [];
    if (r() < 0.6) keys.push({ responsible: "IT", level: (r() < 0.5 ? 1 : 2) as 1 | 2 });
    if (r() < 0.3) keys.push({ responsible: "QA Tester", level: 1 });
    if (r() < 0.3) keys.push({ responsible: "Creative", level: (r() < 0.5 ? 1 : 2) as 1 | 2 });
    const pto: string[] = [];
    for (let k = int(r, 0, 3); k > 0; k -= 1) {
      const from = addDays(startDate, int(r, -10, 80));
      for (let n = int(r, 1, 12); n > 0; n -= 1) pto.push(ymd(addDays(from, n)));
    }
    return {
      id: `d${i}`,
      name: `Dev ${i}`,
      skills: {
        ...(r() < 0.8 ? { wordpress: int(r, 1, 5) } : {}),
        ...(r() < 0.5 ? { html: int(r, 1, 5) } : {}),
        ...(r() < 0.4 ? { "quality assurance": int(r, 1, 5) } : {}),
      },
      hoursPerDay: pick(r, [1, 2, 3.2, 4, 6, 6.4, 8]),
      ptoDays: pto,
      keys,
      bookedHours: r() < 0.5 ? 0 : int(r, 1, 300),
    };
  });
  const tasks: PlanTask[] = Array.from({ length: int(r, 1, 25) }, (_, i) => {
    const role = r() < 0.15 ? null : pick(r, ROLES);
    const phase: PhaseId = role ? role.phase : pick(r, ["discovery", "content", "development", "qa", "seo", "launch"] as const);
    return {
      id: `t${i}`,
      title: pick(r, ["Build page", "Custom plugin", "Go-live deploy", "DNS setup", "Template", "Checkout"]),
      phase,
      hours: pick(r, [0.5, 1, 2, 3, 5, 8, 12, 16, 24, 40]),
      role: role ? { responsible: role.responsible, level: role.level } : null,
    };
  });
  // Phase floors as the store passes them: increasing ISO dates from the start.
  const floors: Partial<Record<PhaseId, string>> = {};
  let off = 0;
  for (const ph of ["discovery", "content", "design", "development", "qa", "seo", "launch"] as PhaseId[]) {
    if (r() < 0.8) floors[ph] = ymd(addDays(startDate, off));
    off += int(r, 0, 9);
  }
  const today = addDays(startDate, -int(r, 0, 20));
  return { start, startDate, devs, tasks, floors, today };
}

const SEEDS = 2500;

test.describe("assignment planner — stress", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  for (const strategy of ["efficient", "quick"] as PlanStrategy[]) {
    test(`${strategy}: ${SEEDS} random plans keep every rule`, () => {
      const problems: string[] = [];
      const fail = (seed: number, msg: string) => {
        if (problems.length < 25) problems.push(`seed ${seed}: ${msg}`);
      };

      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const s = scenario(seed);
        const opts = { strategy, projectStart: s.startDate, today: s.today, phaseStart: s.floors };
        const plan = planSchedule(s.tasks, s.devs, "wordpress", opts);

        // Same input, same plan.
        const again = planSchedule(s.tasks, s.devs, "wordpress", opts);
        if (JSON.stringify(again) !== JSON.stringify(plan)) fail(seed, "not deterministic");

        const devById = new Map(s.devs.map((d) => [d.id, d]));
        const taskById = new Map(s.tasks.map((t) => [t.id, t]));
        const order: PhaseId[] = ["discovery", "content", "design", "development", "qa", "seo", "launch"];
        const phaseEnd = new Map<PhaseId, string>();
        for (const p of plan.tasks) {
          const ph = taskById.get(p.taskId)!.phase;
          if (p.endDate && (!phaseEnd.get(ph) || p.endDate > phaseEnd.get(ph)!)) phaseEnd.set(ph, p.endDate);
        }

        const lastEndByDev = new Map<string, string>();
        for (const p of plan.tasks) {
          const t = taskById.get(p.taskId)!;
          if (!p.startDate || !p.endDate) { fail(seed, `${t.id} has no dates`); continue; }
          if (p.endDate < p.startDate) fail(seed, `${t.id} ends before it starts`);

          // Phase order: never before an earlier phase's last day, nor before its floor.
          const idx = order.indexOf(t.phase);
          for (const earlier of order.slice(0, idx)) {
            const e = phaseEnd.get(earlier);
            if (e && p.startDate < e) fail(seed, `${t.id} (${t.phase}) starts ${p.startDate}, before ${earlier} ends ${e}`);
          }
          const floor = s.floors[t.phase];
          if (floor && p.startDate < floor) fail(seed, `${t.id} starts ${p.startDate} before its phase floor ${floor}`);

          if (!p.assigneeId) {
            // Unassigned work still reserves real working days.
            if (isWeekend(p.startDate) || isUsHoliday(p.startDate)) fail(seed, `unassigned ${t.id} starts on a non-working day ${p.startDate}`);
            if (isWeekend(p.endDate) || isUsHoliday(p.endDate)) fail(seed, `unassigned ${t.id} ends on a non-working day ${p.endDate}`);
            continue;
          }

          const dev = devById.get(p.assigneeId)!;
          const pto = new Set(dev.ptoDays ?? []);

          // Seniority: a governed role only goes to a qualifying key holder.
          if (t.role && keysGovern(s.devs, t.role) && !holdsKeyFor(dev.keys, t.role)) {
            fail(seed, `${t.id} (${t.role.responsible} L${t.role.level}) went to ${dev.name} without the key`);
          }

          // No weekend / holiday / leave at either end.
          if (!isWorkdayFor(p.startDate, pto)) fail(seed, `${t.id} starts on a day ${dev.name} doesn't work: ${p.startDate}`);
          if (!isWorkdayFor(p.endDate, pto)) fail(seed, `${t.id} ends on a day ${dev.name} doesn't work: ${p.endDate}`);

          // Enough working days for the hours, and no unexplained gap inside.
          const wd = workdaysBetween(p.startDate, p.endDate, pto);
          const hpd = Math.max(1, dev.hoursPerDay);
          if (wd * hpd + 1e-9 < t.hours) fail(seed, `${t.id}: ${t.hours}h squeezed into ${wd} days at ${hpd}h/day`);
          if (wd > Math.ceil(t.hours / hpd - 1e-9) + 1) fail(seed, `${t.id}: ${t.hours}h spread over ${wd} days at ${hpd}h/day (gap)`);

          // A person's tasks never overlap (only a shared boundary day).
          const prev = lastEndByDev.get(dev.id);
          if (prev && p.startDate < prev) fail(seed, `${dev.name} double-booked: ${t.id} starts ${p.startDate} before their previous task ends ${prev}`);
          lastEndByDev.set(dev.id, p.endDate);
        }

        // Existing workload first, then no idle days: a person's first new task
        // starts no earlier than their booked work allows, and no later than the
        // first day they are free AND its phase may begin.
        const firstByDev = new Map<string, { start: string; phase: PhaseId }>();
        for (const p of plan.tasks) {
          if (!p.assigneeId || !p.startDate || firstByDev.has(p.assigneeId)) continue;
          firstByDev.set(p.assigneeId, { start: p.startDate, phase: taskById.get(p.taskId)!.phase });
        }
        for (const [id, first] of firstByDev) {
          const dev = devById.get(id)!;
          const pto = new Set(dev.ptoDays ?? []);
          const hpd = Math.max(1, dev.hoursPerDay);
          // Independent model: booked hours worked off from `today`.
          let cursor = nextWorkday(ymd(s.today), pto);
          let left = dev.bookedHours ?? 0;
          let usedToday = 0;
          while (left > 1e-9) {
            const take = Math.min(left, hpd - usedToday);
            left -= take;
            usedToday += take;
            if (left > 1e-9) { cursor = nextWorkday(ymd(addDays(day(cursor), 1)), pto); usedToday = 0; }
          }
          const freeFrom = (dev.bookedHours ?? 0) > 0
            ? (usedToday >= hpd - 1e-9 ? nextWorkday(ymd(addDays(day(cursor), 1)), pto) : cursor)
            : nextWorkday(ymd(s.startDate), pto);
          if ((dev.bookedHours ?? 0) > 0 && first.start < cursor) {
            fail(seed, `${dev.name} starts new work ${first.start} before their booked work ends ${cursor}`);
          }
          // Latest acceptable start: free AND phase open AND every earlier phase done.
          const idx = order.indexOf(first.phase);
          let gate = s.floors[first.phase] ?? ymd(s.startDate);
          for (const earlier of order.slice(0, idx)) {
            const e = phaseEnd.get(earlier);
            if (e && e > gate) gate = e;
          }
          const latest = nextWorkday(freeFrom > gate ? freeFrom : gate, pto);
          if (first.start > latest) fail(seed, `${dev.name} idles: first task ${first.start}, but free and allowed from ${latest}`);
        }
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});

test.describe("tentative timeline — stress", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  test(`${SEEDS} random estimates: phases on working days, in order, around leave`, () => {
    const problems: string[] = [];
    const fail = (seed: number, msg: string) => {
      if (problems.length < 25) problems.push(`seed ${seed}: ${msg}`);
    };
    const asYmd = (display: string) => ymd(parse(display, "MMM d, yyyy", new Date()));

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const r = rng(seed * 7919);
      const start = pick(r, START_POOL);
      const p: DiscoveryProject = {
        ...createEmptyDiscoveryProject(),
        id: "x", created_at: "", updated_at: "",
        platform: "wordpress",
        project_start_date: start,
        total_pages: int(r, 1, 60),
        unique_templates: int(r, 0, 12),
        has_ecommerce: r() < 0.3,
        has_blog: r() < 0.5,
        multi_language: r() < 0.2,
        is_redesign: r() < 0.5,
        client_review_turnaround: int(r, 0, 5),
        has_blackout_periods: r() < 0.2,
        skipped_sections: [3, 4, 6, 7, 8].filter(() => r() < 0.2),
      };
      // A team with random approved leave, sometimes everyone off at once.
      const members = Array.from({ length: int(r, 1, 5) }, (_, i) => ({ id: `m${i}`, confirmed_at: "2026-01-01" }));
      const entries = members.flatMap((m) =>
        Array.from({ length: int(r, 0, 3) }, () => {
          const from = addDays(day(start), int(r, -5, 90));
          return { user_id: m.id, kind: (r() < 0.15 ? "partial" : "pto") as "partial" | "pto", status: "approved" as const, start_date: ymd(from), end_date: ymd(addDays(from, int(r, 0, 10))) };
        }),
      );
      const cal = r() < 0.7 ? buildTeamCalendar(members, entries) : null;
      const buffer = pick(r, [0, 0, 10, 20, 35]);

      const res = analyzeDiscovery(p, cal, buffer);
      const phases = res.timeline.phases;
      const byId = new Map(phases.map((ph) => [ph.id, ph]));

      for (const ph of phases) {
        for (const [what, d] of [["starts", ph.startDate], ["ends", ph.endDate]] as const) {
          const iso = asYmd(d);
          if (isWeekend(iso) || isUsHoliday(iso)) fail(seed, `${ph.label} ${what} on a non-working day ${iso} (start ${start})`);
          if (cal && (cal.factor.get(iso) ?? 1) === 0 && !(what === "starts" && ph.startOffset === 0)) {
            fail(seed, `${ph.label} ${what} ${iso}, a day the whole team is on leave`);
          }
        }
        if (ph.endOffset < ph.startOffset) fail(seed, `${ph.label} ends before it starts`);
        if (asYmd(ph.endDate) < asYmd(ph.startDate)) fail(seed, `${ph.label} end date before start date`);
      }
      // Sequencing (the engine's own rules).
      const after = (a: PhaseId, b: PhaseId) => {
        const A = byId.get(a), B = byId.get(b);
        if (A && B && B.startOffset < A.endOffset) fail(seed, `${B.label} starts before ${A.label} ends`);
      };
      after("discovery", "design");
      after("design", "development");
      after("content", "development");
      after("development", "qa");
      after("qa", "launch");
      // Later offsets never map to earlier dates.
      const sorted = [...phases].sort((a, b) => a.startOffset - b.startOffset);
      for (let i = 1; i < sorted.length; i += 1) {
        if (asYmd(sorted[i].startDate) < asYmd(sorted[i - 1].startDate)) fail(seed, "dates out of order with offsets");
      }
      const launch = byId.get("launch");
      if (launch && res.timeline.totalBusinessDays < launch.endOffset) fail(seed, "total shorter than launch");
      if (res.timeline.totalBusinessDays < res.timeline.baseBusinessDays) fail(seed, "buffer shortened the plan");
      for (const m of res.timeline.milestones) {
        const ph = byId.get(m.phaseId);
        if (!ph) fail(seed, `milestone ${m.id} for a phase that isn't there`);
        else if (m.date !== ph.endDate) fail(seed, `milestone ${m.id} ${m.date} ≠ ${ph.label} end ${ph.endDate}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("the working-day walk never lands on a weekend, holiday or empty day", () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 400; seed += 1) {
      const r = rng(seed * 104729);
      const start = day(pick(r, START_POOL));
      const members = [{ id: "a", confirmed_at: "x" }, { id: "b", confirmed_at: "x" }];
      const from = addDays(start, int(r, 0, 20));
      const entries = [
        { user_id: "a", kind: "pto" as const, status: "approved" as const, start_date: ymd(from), end_date: ymd(addDays(from, int(r, 0, 8))) },
        { user_id: "b", kind: "pto" as const, status: "approved" as const, start_date: ymd(from), end_date: ymd(addDays(from, int(r, 0, 8))) },
      ];
      const cal = buildTeamCalendar(members, entries)!;
      let prev = ymd(start);
      for (let n = 1; n <= 60; n += 1) {
        const d = ymd(addWorkingDays(start, n, cal));
        if (isWeekend(d) || isUsHoliday(d) || (cal.factor.get(d) ?? 1) === 0) problems.push(`seed ${seed}: +${n} → ${d}`);
        if (d <= prev) problems.push(`seed ${seed}: +${n} → ${d} not after +${n - 1} (${prev})`);
        prev = d;
        if (problems.length > 20) break;
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
