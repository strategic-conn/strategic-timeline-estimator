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
import type { ProposalPlatform } from "@/lib/proposal-catalog";

export type PlanStrategy = "quick" | "efficient";

export interface PlanTask {
  id: string;
  title: string;
  phase: PhaseId;
  /** Estimated effort in hours. */
  hours: number;
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
}

function makeClock(dev: PlanDev, start: Date): Clock {
  return {
    dev,
    pto: new Set(dev.ptoDays ?? []),
    hoursPerDay: Math.max(1, dev.hoursPerDay),
    day: new Date(start.getTime()),
    hoursLeftToday: 0, // forces a fresh working day on first use
  };
}
function isWorkday(clock: Clock, d: Date): boolean {
  return !isWeekend(d) && !clock.pto.has(isoDay(d));
}
/** Advance to the next workday and refill the day's hours. */
function stepToNextWorkday(clock: Clock): void {
  do {
    clock.day = addDays(clock.day, 1);
  } while (!isWorkday(clock, clock.day));
  clock.hoursLeftToday = clock.hoursPerDay;
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
    clock.hoursLeftToday = clock.hoursPerDay;
  }
  // Make sure we're on a workday with capacity left.
  while (!isWorkday(clock, clock.day) || clock.hoursLeftToday <= 0) {
    if (!isWorkday(clock, clock.day)) {
      clock.day = addDays(clock.day, 1);
      if (isWorkday(clock, clock.day)) clock.hoursLeftToday = clock.hoursPerDay;
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

  const clocks = new Map(devs.map((d) => [d.id, makeClock(d, projectStart)]));
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
      const tiers = skillTiers(task, platform);
      let eligible: { dev: PlanDev; fit: { level: number; skill: string | null } }[] = [];
      for (const tier of tiers) {
        eligible = devs
          .map((d) => ({ dev: d, fit: fitLevel(d, tier) }))
          .filter((c) => c.fit.level > 0);
        if (eligible.length) break;
      }

      if (!tiers.length || !eligible.length) {
        // No dev skill maps here → reserve time at a default rate, leave unassigned.
        const days = Math.max(1, Math.ceil(task.hours / DEFAULT_HOURS_PER_DAY));
        let cur = notBefore;
        let placed = 0;
        let start: string | null = null;
        while (placed < days) {
          if (!isWeekend(cur)) {
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
          reason: tiers.length
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
          // finish soonest; break ties by higher skill, then name for determinism
          if (a.end !== b.end) return a.end < b.end ? -1 : 1;
          if (a.fit.level !== b.fit.level) return b.fit.level - a.fit.level;
        } else {
          // best skill; break ties by earliest finish, then name
          if (a.fit.level !== b.fit.level) return b.fit.level - a.fit.level;
          if (a.end !== b.end) return a.end < b.end ? -1 : 1;
        }
        return a.dev.name < b.dev.name ? -1 : 1;
      });

      const winner = scored[0];
      const clock = clocks.get(winner.dev.id)!;
      const { start, end } = place(clock, task.hours, notBefore);
      phaseEnd = maxIso(phaseEnd, end);
      planned.push({
        taskId: task.id,
        assigneeId: winner.dev.id,
        assigneeName: winner.dev.name,
        startDate: start,
        endDate: end,
        matchedSkill: winner.fit.skill,
        confidence: winner.fit.level,
        reason: `${winner.dev.name} · ${winner.fit.skill} ★${winner.fit.level} · ${winner.dev.hoursPerDay}h/day`,
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
