/**
 * Resource-aware assignment + scheduling engine (deterministic — no AI).
 *
 * Given the tasks a project starts with (from the approved estimate), the devs
 * available (skills + hours/day + PTO), and a strategy, it decides WHO does each
 * dev/QA task and WHEN — producing per-task assignee + dates and a project
 * finish date. Design/discovery/content/SEO tasks have no matching dev skills,
 * so they're left unassigned (a human plans those) but still reserve time on
 * the timeline via their phase floor.
 *
 * Two strategies (see the `PlanStrategy` doc):
 *   - "quick"     → spread work across every qualified dev to finish soonest.
 *   - "efficient" → concentrate on the highest-skilled, fewer hands, best quality.
 *
 * Pure + dependency-free (plain `Date`, no `@/` runtime imports) so it is unit
 * testable via `plan.check.ts`. Skill keys are compared case-insensitively.
 */
import type { PhaseId } from "@/types/discovery.types";
import { isUsHoliday } from "@/lib/calendar/us-holidays";
import type { ProposalPlatform } from "@/lib/proposal-catalog";

export type PlanStrategy = "quick" | "efficient";

/** A discipline + level — the workbook's lookup key, "IT|Level 2". */
export interface WorkKey {
  responsible: string;
  level: 1 | 2;
}

/**
 * Are keys in use for this discipline? Once anyone holds an IT key, IT keys
 * decide who does IT work; a discipline nobody holds a key for keeps the
 * skill-only rule. Per discipline, so setting one designer's key does not
 * change how development is assigned.
 */
export function keysGovern(
  people: { keys?: WorkKey[] }[],
  role: WorkKey | null,
): boolean {
  return (
    role != null &&
    people.some((p) => (p.keys ?? []).some((k) => k.responsible === role.responsible))
  );
}

/** Level 2 may take Level 1 work (plan decision 2); never the reverse. */
export function holdsKeyFor(
  keys: WorkKey[] | undefined,
  role: WorkKey,
): boolean {
  return (keys ?? []).some(
    (k) => k.responsible === role.responsible && k.level >= role.level,
  );
}

export interface PlanTask {
  id: string;
  title: string;
  phase: PhaseId;
  /** Estimated effort in hours. */
  hours: number;
  /** Who the estimate says does this (its line's role). null = no role. */
  role?: WorkKey | null;
  /**
   * Sprint planning only: the task this one TESTS. It starts the working day
   * after that task is built, in whichever sprint that lands in.
   */
  after?: string;
}

export interface PlanDev {
  id: string;
  name: string;
  /** skill name → confidence 1..5. Compared case-insensitively. */
  skills: Record<string, number>;
  /** Available hours on a normal working day. */
  hoursPerDay: number;
  /** ISO `yyyy-mm-dd` days the dev is fully off (PTO). */
  ptoDays?: string[];
  /** Admin-set work keys (0043). Matched before skills. */
  keys?: WorkKey[];
  /**
   * Open hours already on this person's plate that are DUE NOW — overdue, due
   * within `BOOKED_DUE_SOON_DAYS` working days, or with no due date (see
   * `splitBookedWork`). Worked off first, from today; new work queues behind
   * it. 0/undefined = free from today.
   */
  bookedHours?: number;
  /**
   * Open work due LATER: each task's hours are spread evenly over the working
   * days from today to its due date, and only that slice comes off each day.
   * Work due in February costs a little every day instead of blocking the
   * calendar until it is done.
   */
  bookedLater?: { hours: number; due: string }[];
}

/** Booked work due within this many working days is done first, in full. */
export const BOOKED_DUE_SOON_DAYS = 5;

/**
 * Split someone's open tasks into what must be done first and what can be
 * spread until its due date. Pure. Overdue and undated work is "now": nothing
 * says it can wait.
 */
export function splitBookedWork(
  tasks: readonly { estimated_hours?: number | null; due_date?: string | null }[],
  today: Date,
): { now: number; later: { hours: number; due: string }[] } {
  let soon = new Date(today.getTime());
  for (let n = 0; n < BOOKED_DUE_SOON_DAYS; ) {
    soon = addDays(soon, 1);
    if (!isWeekend(soon) && !isUsHoliday(isoDay(soon))) n += 1;
  }
  const cutoff = isoDay(soon);
  let now = 0;
  const later: { hours: number; due: string }[] = [];
  for (const t of tasks) {
    const hours = Math.max(0, t.estimated_hours ?? 0);
    if (!hours) continue;
    const due = t.due_date?.slice(0, 10);
    if (due && due > cutoff) later.push({ hours, due });
    else now += hours;
  }
  return { now: Math.round(now * 10) / 10, later };
}

export interface PlanOptions {
  strategy: PlanStrategy;
  /** Project start (defaults to today). */
  projectStart?: Date;
  /**
   * Earliest ISO date each phase may begin — from the tentative timeline, so
   * design→dev→qa stay sequenced. Missing phases fall back to `projectStart`.
   */
  phaseStart?: Partial<Record<PhaseId, string>>;
  /** When booked work starts being worked off (defaults to now). For tests. */
  today?: Date;
}

export interface PlannedTask {
  taskId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;
  matchedSkill: string | null;
  /** Matched skill confidence (0 = unassigned). */
  confidence: number;
  reason: string;
}

export interface PlanResult {
  tasks: PlannedTask[];
  unassigned: PlannedTask[];
  finishDate: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Baseline every front-end dev is expected to have. */
const BASELINE_SKILL = "html";
/** Fallback day length for unassigned phases so they still take time. */
const DEFAULT_HOURS_PER_DAY = 6;

const PLATFORM_SKILL: Record<ProposalPlatform, string[]> = {
  wordpress: ["wordpress"],
  shopify: ["shopify"],
  wix: ["wix"],
  squarespace: ["squarespace"],
  php: ["php", "wordpress"],
  react_next: ["next.js", "react"],
  custom: ["next.js", "react"],
};

/**
 * Tiered skill preferences for a task, best tier first. The scheduler uses the
 * FIRST tier that has an eligible dev — so specialists win, and a generalist
 * fallback only kicks in when no specialist exists. Empty = "no dev skill maps
 * to this" → left for a human to assign (e.g. design).
 */
export function skillTiers(
  task: PlanTask,
  platform: ProposalPlatform,
): string[][] {
  const t = norm(task.title);
  if (task.phase === "qa") return [["quality assurance"]];
  if (task.phase === "launch")
    return [["inmotion hosting"], ["domain config", "dns config"]];
  if (task.phase === "development") {
    if (/\bplugin/.test(t)) return [["custom plugin wordpress"], ["wordpress"]];
    if (/\bdns\b/.test(t)) return [["dns config"], ["inmotion hosting"]];
    if (/\bdomain/.test(t)) return [["domain config"], ["inmotion hosting"]];
    if (/go[-\s]?live|deploy|launch|hosting|inmotion|migrat/.test(t))
      return [["inmotion hosting"]];
    return [PLATFORM_SKILL[platform] ?? [BASELINE_SKILL], [BASELINE_SKILL]];
  }
  // discovery, content, design, seo → no matching dev skill
  return [];
}

/** Best confidence a dev has among the wanted skills (0 = not eligible). */
function fitLevel(
  dev: PlanDev,
  wanted: string[],
): { level: number; skill: string | null } {
  let level = 0;
  let skill: string | null = null;
  const lut: Record<string, number> = {};
  for (const [k, v] of Object.entries(dev.skills)) lut[norm(k)] = v;
  for (const w of wanted) {
    const c = lut[w] ?? 0;
    if (c > level) {
      level = c;
      skill = w;
    }
  }
  return { level, skill };
}

// ── date helpers (plain Date; business days = Mon–Fri, minus PTO) ──
function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}
/** Local calendar date "yyyy-MM-dd" (never UTC — avoids off-by-one shifts). */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}
/**
 * Parse a date string to a local-midnight Date. Accepts "yyyy-MM-dd", full ISO,
 * or human formats like "MMM d, yyyy" (what the timeline engine emits). Falls
 * back for empty/invalid input so the scheduler never sees an Invalid Date.
 */
function parseDay(s: string, fallback: Date = new Date()): Date {
  if (s) {
    const isoOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = isoOnly ? new Date(`${s}T00:00:00`) : new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(fallback.getTime());
}

/** A dev's running calendar position while packing their queue. */
interface Clock {
  dev: PlanDev;
  pto: Set<string>;
  hoursPerDay: number;
  day: Date;
  hoursLeftToday: number;
  /** Later-due booked work: hours/day taken off every working day up to `until`. */
  spread: { perDay: number; from: string; until: string }[];
}

/** Hours free on `d` once later-due booked work has taken its daily slice. */
function capacityOn(clock: Clock, d: Date): number {
  const day = isoDay(d);
  let taken = 0;
  for (const s of clock.spread) if (day >= s.from && day <= s.until) taken += s.perDay;
  // A day the spread fills completely is skipped by `place`, like a day off.
  return Math.max(0, clock.hoursPerDay - taken);
}

function makeClock(dev: PlanDev, start: Date): Clock {
  const clock: Clock = {
    dev,
    pto: new Set(dev.ptoDays ?? []),
    hoursPerDay: Math.max(1, dev.hoursPerDay),
    day: new Date(start.getTime()),
    hoursLeftToday: 0,
    spread: [],
  };
  // The first day is a full day when it is a working one. It used to start at
  // 0 h, which made `place` step to the NEXT workday: every free person began a
  // day late, and booked work was worked off from tomorrow instead of today
  // (found by e2e/timeline-stress.spec.ts, 2026-10-27).
  if (isWorkday(clock, clock.day)) clock.hoursLeftToday = clock.hoursPerDay;
  return clock;
}

/** Spread each later-due task over the working days from `today` to its due date. */
function withSpread(clock: Clock, today: Date): Clock {
  const from = isoDay(today);
  for (const b of clock.dev.bookedLater ?? []) {
    let days = 0;
    for (let d = new Date(today.getTime()); isoDay(d) <= b.due && days < 1000; d = addDays(d, 1)) {
      if (isWorkday(clock, d)) days += 1;
    }
    if (days > 0 && b.hours > 0) clock.spread.push({ perDay: b.hours / days, from, until: b.due });
  }
  if (isWorkday(clock, clock.day)) clock.hoursLeftToday = capacityOn(clock, clock.day);
  return clock;
}
function isWorkday(clock: Clock, d: Date): boolean {
  // Holidays here as well as in the tentative timeline: without it the estimate
  // would step over Christmas while the assigned plan booked work on it, and
  // the two schedules a manager compares would disagree by a day.
  const day = isoDay(d);
  return !isWeekend(d) && !isUsHoliday(day) && !clock.pto.has(day);
}
/** Advance to the next workday and refill the day's hours. */
function stepToNextWorkday(clock: Clock): void {
  do {
    clock.day = addDays(clock.day, 1);
  } while (!isWorkday(clock, clock.day));
  clock.hoursLeftToday = capacityOn(clock, clock.day);
}

/**
 * Place `hours` of work on the clock, not starting before `notBefore`.
 * Returns the inclusive start/end ISO days. Mutates the clock forward.
 */
function place(
  clock: Clock,
  hours: number,
  notBefore: Date,
): { start: string; end: string } {
  // Jump forward to the phase floor (fresh day) if it's later than where we are.
  if (parseDay(isoDay(clock.day)).getTime() < parseDay(isoDay(notBefore)).getTime()) {
    clock.day = new Date(notBefore.getTime());
    clock.hoursLeftToday = capacityOn(clock, clock.day);
  }
  // Make sure we're on a workday with capacity left.
  while (!isWorkday(clock, clock.day) || clock.hoursLeftToday <= 0) {
    if (!isWorkday(clock, clock.day)) {
      clock.day = addDays(clock.day, 1);
      if (isWorkday(clock, clock.day)) clock.hoursLeftToday = capacityOn(clock, clock.day);
      continue;
    }
    stepToNextWorkday(clock);
  }

  const start = isoDay(clock.day);
  let remaining = Math.max(0, hours);
  let end = start;
  // A zero-hour task still occupies its start day.
  if (remaining <= 0) return { start, end };
  while (remaining > 0) {
    if (clock.hoursLeftToday <= 0) stepToNextWorkday(clock);
    const take = Math.min(remaining, clock.hoursLeftToday);
    remaining -= take;
    clock.hoursLeftToday -= take;
    end = isoDay(clock.day);
  }
  return { start, end };
}

/** Trial-place without mutating the real clock (for candidate comparison). */
function trialEnd(clock: Clock, hours: number, notBefore: Date): string {
  const copy: Clock = {
    ...clock,
    day: new Date(clock.day.getTime()),
    pto: clock.pto,
    spread: clock.spread,
  };
  return place(copy, hours, notBefore).end;
}

const PHASE_ORDER: PhaseId[] = [
  "discovery",
  "content",
  "design",
  "development",
  "qa",
  "seo",
  "launch",
];

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * The shared step: who does ONE task and when, given the earliest day it may
 * start. Holds everyone's calendar (booked work, leave, holidays) and load, so
 * the phase planner and the sprint planner place work by exactly the same rules.
 */
function createPlanner(
  devs: PlanDev[],
  platform: ProposalPlatform,
  opts: PlanOptions,
  projectStart: Date,
) {
  const today = opts.today ? new Date(opts.today.getTime()) : new Date();
  // Existing load is worked off from TODAY, not from the project start: a
  // project starting next month finds its people partly free by then. The
  // phase floors below still stop new work starting before its phase.
  // Work due NOW (`bookedHours`) queues FIFO ahead of new work; work due
  // LATER (`bookedLater`) only takes its daily slice until its due date.
  const clocks = new Map(
    devs.map((d) => {
      const booked = Math.max(0, d.bookedHours ?? 0);
      if (booked <= 0) return [d.id, withSpread(makeClock(d, projectStart), today)] as const;
      const clock = withSpread(makeClock(d, today), today);
      place(clock, booked, today);
      // Booked work that clears before the project starts must not make this
      // person look MORE available than a free one: a fresh clock and a
      // worked-off one land on different first days, and Fastest would then
      // pick the busy person. Cleared in time = exactly as if free.
      if (isoDay(clock.day) < isoDay(projectStart)) {
        return [d.id, withSpread(makeClock(d, projectStart), today)] as const;
      }
      return [d.id, clock] as const;
    }),
  );
  // Everything each person is carrying — work already booked (due now and
  // later) plus what this plan has given them so far. The final tie-break:
  // equal finish and equal stars go to whoever carries less, so work spreads
  // across the team instead of piling onto one person.
  const load = new Map(
    devs.map((d) => [
      d.id,
      Math.max(0, d.bookedHours ?? 0) +
        (d.bookedLater ?? []).reduce((sum, b) => sum + Math.max(0, b.hours), 0),
    ]),
  );


  return function assign(task: PlanTask, notBefore: Date): PlannedTask {
    const tiers = skillTiers(task, platform);
    // Key first (plan decision 2): where keys govern the task's discipline,
    // only holders of a qualifying key are eligible and skill stars merely
    // break ties — so a Creative key holder gets design work no skill maps
    // to, and Level 2 work never falls to a Level 1. Where they don't (every
    // workspace before keys are set), the skill-only rule runs as it always has.
    const role = task.role ?? null;
    const governed = keysGovern(devs, role);
    const keyed = governed && role ? devs.filter((d) => holdsKeyFor(d.keys, role)) : [];
    let eligible: { dev: PlanDev; fit: { level: number; skill: string | null } }[] = [];
    if (governed) {
      const tier =
        tiers.find((t) => keyed.some((d) => fitLevel(d, t).level > 0)) ?? [];
      eligible = keyed.map((d) => ({ dev: d, fit: fitLevel(d, tier) }));
    } else {
      for (const tier of tiers) {
        eligible = devs
          .map((d) => ({ dev: d, fit: fitLevel(d, tier) }))
          .filter((c) => c.fit.level > 0);
        if (eligible.length) break;
      }
    }

    if (!eligible.length) {
      // No dev skill maps here → reserve time at a default rate, leave unassigned.
      const days = Math.max(1, Math.ceil(task.hours / DEFAULT_HOURS_PER_DAY));
      let cur = notBefore;
      let placed = 0;
      let start: string | null = null;
      while (placed < days) {
        if (!isWeekend(cur) && !isUsHoliday(isoDay(cur))) {
          if (!start) start = isoDay(cur);
          placed += 1;
        }
        if (placed < days) cur = addDays(cur, 1);
      }
      const end = isoDay(cur);
      return {
        taskId: task.id,
        assigneeId: null,
        assigneeName: null,
        startDate: start,
        endDate: end,
        matchedSkill: null,
        confidence: 0,
        reason:
          governed && role
            ? `Nobody holds ${role.responsible} Level ${role.level} — assign manually`
            : tiers.length
              ? "No available dev has this skill — assign manually"
              : "Not auto-assigned (design/planning) — assign manually",
      };
    }

    // Score candidates by a trial placement.
    const scored = eligible.map((c) => {
      const clock = clocks.get(c.dev.id)!;
      return { ...c, end: trialEnd(clock, task.hours, notBefore) };
    });
    scored.sort((a, b) => {
      if (opts.strategy === "quick") {
        // finish soonest; break ties by higher skill, then least load
        if (a.end !== b.end) return a.end < b.end ? -1 : 1;
        if (a.fit.level !== b.fit.level) return b.fit.level - a.fit.level;
      } else {
        // best skill; break ties by earliest finish, then least load
        if (a.fit.level !== b.fit.level) return b.fit.level - a.fit.level;
        if (a.end !== b.end) return a.end < b.end ? -1 : 1;
      }
      const la = load.get(a.dev.id) ?? 0;
      const lb = load.get(b.dev.id) ?? 0;
      if (la !== lb) return la - lb;
      // Identical on every count: id, only so the same input always gives
      // the same plan.
      return a.dev.id < b.dev.id ? -1 : a.dev.id > b.dev.id ? 1 : 0;
    });

    const winner = scored[0];
    const clock = clocks.get(winner.dev.id)!;
    const { start, end } = place(clock, task.hours, notBefore);
    load.set(winner.dev.id, (load.get(winner.dev.id) ?? 0) + task.hours);
    return {
      taskId: task.id,
      assigneeId: winner.dev.id,
      assigneeName: winner.dev.name,
      startDate: start,
      endDate: end,
      matchedSkill: winner.fit.skill,
      confidence: winner.fit.level,
      reason: [
        winner.dev.name,
        governed && role ? `${role.responsible} L${role.level}` : null,
        winner.fit.skill ? `${winner.fit.skill} ★${winner.fit.level}` : null,
        `${winner.dev.hoursPerDay}h/day`,
        (winner.dev.bookedHours ?? 0) > 0
          ? `after ${Math.round(winner.dev.bookedHours!)}h of work due now`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };
}

/**
 * Assign + schedule. Deterministic: same input → same output.
 */
export function planSchedule(
  tasks: PlanTask[],
  devs: PlanDev[],
  platform: ProposalPlatform,
  opts: PlanOptions,
): PlanResult {
  const projectStart = opts.projectStart
    ? new Date(opts.projectStart.getTime())
    : new Date();
  const phaseStart = opts.phaseStart ?? {};
  const floorFor = (phase: PhaseId): Date => {
    const s = phaseStart[phase];
    return s ? parseDay(s, projectStart) : new Date(projectStart.getTime());
  };
  const assign = createPlanner(devs, platform, opts, projectStart);
  const planned: PlannedTask[] = [];

  // Process phase by phase so dev→qa stay ordered; longest tasks first packs better.
  const byPhase = new Map<PhaseId, PlanTask[]>();
  for (const t of tasks) {
    const arr = byPhase.get(t.phase) ?? [];
    arr.push(t);
    byPhase.set(t.phase, arr);
  }

  let runningFloor: string | null = null; // latest end so far (for phases w/o an explicit floor)

  for (const phase of PHASE_ORDER) {
    const phaseTasks = (byPhase.get(phase) ?? []).sort(
      (a, b) => b.hours - a.hours,
    );
    if (!phaseTasks.length) continue;

    const explicitFloor = phaseStart[phase] ? isoDay(floorFor(phase)) : null;
    const notBeforeIso = maxIso(explicitFloor, runningFloor) ?? isoDay(projectStart);
    const notBefore = parseDay(notBeforeIso);
    let phaseEnd: string | null = null;

    for (const task of phaseTasks) {
      const p = assign(task, notBefore);
      phaseEnd = maxIso(phaseEnd, p.endDate);
      planned.push(p);
    }

    runningFloor = maxIso(runningFloor, phaseEnd);
  }

  const finishDate = planned.reduce<string | null>(
    (acc, t) => maxIso(acc, t.endDate),
    null,
  );
  return {
    tasks: planned,
    unassigned: planned.filter((t) => !t.assigneeId),
    finishDate,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Sprint planning (decided 2026-11-09)                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/** Default working days in one build sprint (two weeks; Settings → Workspace → Sprint length overrides). */
export const SPRINT_WORKING_DAYS = 10;
/** Client review time when the estimate does not say (working days). */
export const DEFAULT_CLIENT_REVIEW_DAYS = 3;
/** The last sprint's name — also the Launch & Handoff phase label. */
export const LAUNCH_SPRINT = "Launch & Handoff";

export type CheckpointKind = "signoff" | "content" | "design" | "review" | "uat" | "golive";

/**
 * A point where the CLIENT acts — signs off, approves, tests. No hours, no
 * price and nobody on the team: it is the client's time. `blocks` names what
 * cannot start until it is done (null for a sprint review, whose feedback goes
 * into the next sprint without holding it up).
 */
export interface ClientCheckpoint {
  id: string;
  kind: CheckpointKind;
  title: string;
  /** What the client does, in plain words. */
  detail: string;
  blocks: string | null;
  start: string;
  end: string;
  /** The sprint it sits in. */
  sprint: string;
}

export interface PlanSprint {
  label: string;
  kind: "setup" | "build" | "launch";
  start: string;
  end: string;
  goal: string;
}

/** A phase with no tasks of its own that still takes time (e.g. Launch & Handoff). */
export interface ReservedBlock {
  phase: PhaseId;
  start: string;
  end: string;
  sprint: string;
}

export interface SprintPlanOptions extends PlanOptions {
  /** Client review time in working days (0 = same-day sign-off). */
  reviewDays: number;
  sprintDays?: number;
  /**
   * Working days a phase takes when it has no tasks but the estimate still
   * has it (Launch & Handoff usually; a guided estimate's design phase).
   */
  phaseDays?: Partial<Record<PhaseId, number>>;
}

export interface SprintPlanResult extends PlanResult {
  sprints: PlanSprint[];
  /** task id → sprint label. */
  sprintOf: Map<string, string>;
  checkpoints: ClientCheckpoint[];
  reserved: ReservedBlock[];
}

const SETUP_PHASES: PhaseId[] = ["discovery", "content", "design"];
const SETUP_NAME: Partial<Record<PhaseId, string>> = {
  discovery: "Discovery",
  content: "Content",
  design: "Design",
};

function isOpenDay(d: Date): boolean {
  return !isWeekend(d) && !isUsHoliday(isoDay(d));
}
/** The first working day strictly after `iso`. */
function nextWorkday(iso: string): string {
  let d = addDays(parseDay(iso), 1);
  while (!isOpenDay(d)) d = addDays(d, 1);
  return isoDay(d);
}
/** `iso` if it is a working day, else the next one. */
function onOrAfterWorkday(iso: string): string {
  let d = parseDay(iso);
  while (!isOpenDay(d)) d = addDays(d, 1);
  return isoDay(d);
}
/** The last day of `n` working days starting on `startIso` (a working day). */
function workdaysFrom(startIso: string, n: number): string {
  let d = parseDay(startIso);
  for (let left = Math.max(1, n) - 1; left > 0; ) {
    d = addDays(d, 1);
    if (isOpenDay(d)) left -= 1;
  }
  return isoDay(d);
}
/** Working days from `a` up to (not including) `b`. */
function workdaysBetween(a: string, b: string): number {
  let n = 0;
  for (let d = parseDay(a); isoDay(d) < b; d = addDays(d, 1)) if (isOpenDay(d)) n += 1;
  return n;
}

/**
 * Plan an estimate as SPRINTS rather than waterfall phases:
 *
 *  1. **Sprint 0** — discovery, content and design, each ending in a client
 *     checkpoint: scope & plan sign-off, content delivered, design approval.
 *     Development cannot start until every one of them is done.
 *  2. **Build sprints** of `sprintDays` working days. Each build task is
 *     followed by its own test task (`after`), starting the next working day —
 *     testing happens inside the sprint, not in a phase at the end. Each sprint
 *     ends in a client review that holds nothing up. The last sprint ends when
 *     its work does: the launch is quoted at the end of the work, not padded
 *     to a sprint boundary.
 *  3. **Launch & Handoff** — user acceptance testing by the client (blocks the
 *     launch), go-live approval, then the launch work.
 *
 * Who does each task is decided by the same `assign` step as `planSchedule`
 * (keys, stars, booked work, leave, holidays, least-load tie-break).
 */
export function planSprints(
  tasks: PlanTask[],
  devs: PlanDev[],
  platform: ProposalPlatform,
  opts: SprintPlanOptions,
): SprintPlanResult {
  const start = onOrAfterWorkday(isoDay(opts.projectStart ?? new Date()));
  const assign = createPlanner(devs, platform, opts, parseDay(start));
  const reviewDays = Math.max(0, Math.round(opts.reviewDays));
  const sprintDays = Math.max(1, opts.sprintDays ?? SPRINT_WORKING_DAYS);
  const phaseDays = opts.phaseDays ?? {};

  const byId = new Map<string, PlannedTask>();
  const checkpoints: ClientCheckpoint[] = [];
  const reserved: ReservedBlock[] = [];
  const sprintOf = new Map<string, string>();
  const byPhase = new Map<PhaseId, PlanTask[]>();
  for (const t of tasks) {
    const arr = byPhase.get(t.phase) ?? [];
    arr.push(t);
    byPhase.set(t.phase, arr);
  }

  const place1 = (t: PlanTask, floor: string): PlannedTask => {
    const p = assign(t, parseDay(floor));
    byId.set(t.id, p);
    return p;
  };
  /** Longest first (packs better), all from the same floor. */
  const run = (list: PlanTask[], floor: string): string | null => {
    let end: string | null = null;
    for (const t of [...list].sort((a, b) => b.hours - a.hours)) {
      end = maxIso(end, place1(t, floor).endDate);
    }
    return end;
  };
  /** A phase's work: its tasks, or the time the estimate reserves for it. */
  const phaseWork = (phase: PhaseId, floor: string, sprint: string): string | null => {
    const list = byPhase.get(phase) ?? [];
    if (list.length) return run(list, floor);
    const days = Math.round(phaseDays[phase] ?? 0);
    if (days <= 0) return null;
    const s0 = onOrAfterWorkday(floor);
    const e0 = workdaysFrom(s0, days);
    reserved.push({ phase, start: s0, end: e0, sprint });
    return e0;
  };
  /** A client gate after `afterIso`; returns its last day and the day work resumes. */
  const gate = (
    afterIso: string,
    cp: Omit<ClientCheckpoint, "start" | "end" | "sprint">,
    sprint: string,
  ): { start: string; end: string; resume: string } => {
    const s0 = reviewDays > 0 ? nextWorkday(afterIso) : afterIso;
    const e0 = reviewDays > 0 ? workdaysFrom(s0, reviewDays) : afterIso;
    checkpoints.push({ ...cp, start: s0, end: e0, sprint });
    return { start: s0, end: e0, resume: nextWorkday(e0) };
  };

  const sprints: PlanSprint[] = [];

  // ── Sprint 0: discovery, content, design — each ends in a client gate ──
  const setupPhases = SETUP_PHASES.filter(
    (ph) => (byPhase.get(ph)?.length ?? 0) > 0 || (phaseDays[ph] ?? 0) > 0,
  );
  let devFloor = start;
  if (setupPhases.length) {
    const label = `Sprint 0 · ${setupPhases.map((ph) => SETUP_NAME[ph]).join(" & ")}`;
    const hasDesign = setupPhases.includes("design");
    let s0End = start;
    let designFloor = start;
    const discoveryEnd = phaseWork("discovery", start, label);
    if (discoveryEnd) {
      const g = gate(discoveryEnd, {
        id: "cp-signoff",
        kind: "signoff",
        title: "Client: scope & plan sign-off",
        detail: "The client agrees the scope, plan and timeline from discovery.",
        blocks: hasDesign ? "Design" : "Development",
      }, label);
      designFloor = g.resume;
      devFloor = g.resume;
      s0End = maxIso(s0End, g.end)!;
    }
    // Content runs alongside discovery; the client then delivers / approves it.
    const contentEnd = phaseWork("content", start, label);
    if (contentEnd) {
      const g = gate(contentEnd, {
        id: "cp-content",
        kind: "content",
        title: "Client: content delivered & approved",
        detail: "The client supplies or signs off the copy and assets the build needs.",
        blocks: "Development",
      }, label);
      devFloor = maxIso(devFloor, g.resume)!;
      s0End = maxIso(s0End, g.end)!;
    }
    const designEnd = hasDesign ? phaseWork("design", designFloor, label) : null;
    if (designEnd) {
      const g = gate(designEnd, {
        id: "cp-design",
        kind: "design",
        title: "Client: design approval",
        detail: "The client approves the designs. Nothing is built before this.",
        blocks: "Development",
      }, label);
      devFloor = maxIso(devFloor, g.resume)!;
      s0End = maxIso(s0End, g.end)!;
    }
    for (const ph of setupPhases)
      for (const t of byPhase.get(ph) ?? []) {
        sprintOf.set(t.id, label);
        s0End = maxIso(s0End, byId.get(t.id)?.endDate ?? null)!;
      }
    for (const b of reserved) s0End = maxIso(s0End, b.end)!;
    sprints.push({
      label,
      kind: "setup",
      start,
      end: s0End,
      goal: "Discovery and client approvals — development starts once the client signs off",
    });
  }

  // ── Build sprints: development (+ SEO), each piece tested right after ──
  const devTasks = [...(byPhase.get("development") ?? []), ...(byPhase.get("seo") ?? [])];
  const devEnd = run(devTasks, devFloor);
  const qa = byPhase.get("qa") ?? [];
  const builtBy = (t: PlanTask) => (t.after ? byId.get(t.after)?.endDate ?? null : null);
  const tests = qa
    .filter((t) => builtBy(t))
    .sort((a, b) => {
      const ea = builtBy(a)!;
      const eb = builtBy(b)!;
      return ea < eb ? -1 : ea > eb ? 1 : b.hours - a.hours;
    });
  let buildEnd = devEnd;
  for (const t of tests) {
    buildEnd = maxIso(buildEnd, place1(t, nextWorkday(builtBy(t)!)).endDate);
  }
  // QA with nothing to follow (no build work, or one pass over everything).
  const loose = qa.filter((t) => !byId.has(t.id));
  if (loose.length) {
    buildEnd = maxIso(buildEnd, run(loose, devEnd ? nextWorkday(devEnd) : devFloor));
  }

  if (buildEnd) {
    const first = onOrAfterWorkday(devFloor);
    const builds: PlanSprint[] = [];
    for (let i = 0, s0 = first; s0 <= buildEnd; i += 1) {
      const full = workdaysFrom(s0, sprintDays);
      const e0 = full < buildEnd ? full : buildEnd;
      const label = `Sprint ${i + 1}`;
      builds.push({
        label,
        kind: "build",
        start: s0,
        end: e0,
        goal: "Build and test — each piece is tested as soon as it is built",
      });
      checkpoints.push({
        id: `cp-review-${i + 1}`,
        kind: "review",
        title: `Client: sprint ${i + 1} review`,
        detail: "The client sees what was built this sprint. Feedback goes into the next sprint; nothing waits for it.",
        blocks: null,
        start: e0,
        end: e0,
        sprint: label,
      });
      s0 = nextWorkday(full);
    }
    sprints.push(...builds);
    for (const t of [...devTasks, ...qa]) {
      const d = byId.get(t.id)?.startDate ?? first;
      const idx = Math.min(
        builds.length - 1,
        Math.max(0, Math.floor(workdaysBetween(first, d) / sprintDays)),
      );
      sprintOf.set(t.id, builds[idx].label);
    }
  }

  // ── Launch & Handoff: client acceptance, go-live, then the launch work ──
  let launchFloor = devFloor;
  let launchStart: string | null = null;
  let lastGate: string | null = null;
  if (buildEnd) {
    const g = gate(buildEnd, {
      id: "cp-uat",
      kind: "uat",
      title: "Client: user acceptance testing",
      detail: "The client tests the finished site on staging and signs it off.",
      blocks: "Launch",
    }, LAUNCH_SPRINT);
    checkpoints.push({
      id: "cp-golive",
      kind: "golive",
      title: "Client: go-live approval",
      detail: "The client gives the go-ahead to launch.",
      blocks: "Launch",
      start: g.end,
      end: g.end,
      sprint: LAUNCH_SPRINT,
    });
    launchStart = g.start;
    lastGate = g.end;
    launchFloor = g.resume;
  }
  const launchTasks = byPhase.get("launch") ?? [];
  const launchEnd = phaseWork("launch", launchFloor, LAUNCH_SPRINT);
  for (const t of launchTasks) sprintOf.set(t.id, LAUNCH_SPRINT);
  if (launchEnd || launchStart) {
    let s0 = launchStart ?? onOrAfterWorkday(launchFloor);
    let e0 = maxIso(launchEnd, lastGate)!;
    for (const t of launchTasks) {
      const p = byId.get(t.id);
      if (p?.startDate && p.startDate < s0) s0 = p.startDate;
      e0 = maxIso(e0, p?.endDate ?? null)!;
    }
    sprints.push({
      label: LAUNCH_SPRINT,
      kind: "launch",
      start: s0,
      end: e0,
      goal: "Client acceptance, go-live and handoff",
    });
  }

  // Anything the steps above didn't place.
  for (const t of tasks) {
    if (byId.has(t.id)) continue;
    place1(t, devFloor);
    sprintOf.set(t.id, sprints.find((sp) => sp.kind === "build")?.label ?? sprints[0]?.label ?? LAUNCH_SPRINT);
  }

  let finishDate: string | null = null;
  for (const p of byId.values()) finishDate = maxIso(finishDate, p.endDate);
  for (const sp of sprints) finishDate = maxIso(finishDate, sp.end);
  // Tasks in input order, so callers can zip them with their lines.
  const ordered = tasks.map((t) => byId.get(t.id)!);
  return {
    tasks: ordered,
    unassigned: ordered.filter((t) => !t.assigneeId),
    finishDate,
    sprints,
    sprintOf,
    checkpoints,
    reserved,
  };
}
