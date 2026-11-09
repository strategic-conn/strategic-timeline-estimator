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
  const planned: PlannedTask[] = [];
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
        phaseEnd = maxIso(phaseEnd, end);
        planned.push({
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
        });
        continue;
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
      phaseEnd = maxIso(phaseEnd, end);
      planned.push({
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
      });
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
