/**
 * Booked time off, folded into the tentative timeline.
 *
 * The estimator's timeline is computed BEFORE anyone is assigned, so there is
 * no person whose leave to subtract — only the team's. The model is therefore
 * team-level: on a given business day, the fraction of the roster that is
 * actually available is the fraction of a working day that day yields. A day
 * nobody is available (a shutdown, a public holiday recorded as everyone off)
 * yields nothing and the timeline simply steps over it.
 *
 * That is a MODEL, not a measurement — a phase only one person works on does
 * not really speed up because four other people are at their desks. It is
 * deliberately the same granularity as the estimate it schedules: phase hours
 * for a team, not for a named individual. Once the work is actually assigned,
 * `planSchedule` does the per-person version with real `ptoDays`.
 */
import { addBusinessDays, addDays, isWeekend } from "date-fns";

import { isUsHoliday, usHolidaysInRange, type UsHoliday } from "@/lib/calendar/us-holidays";
import {
  PARTIAL_DAY_WEIGHT,
  countsAgainstCapacity,
  type AwayEntryLike,
} from "@/lib/constants/workload";
import { formatYmdLocal } from "@/lib/utils/availability-dates";

export interface TeamCalendar {
  /**
   * `yyyy-mm-dd` → the fraction of the roster available that day (0–1).
   * A date that is absent from the map is a fully-staffed day.
   */
  factor: Map<string, number>;
  /** Roster size the fractions are out of — 0 means "we know nothing". */
  headcount: number;
}

export interface CalendarMember {
  id: string;
  deactivated_at?: string | null;
  confirmed_at?: string | null;
}

/**
 * Build the calendar from a roster and everyone's time off.
 *
 * Returns `null` when there is nobody to reason about — an empty roster (the
 * team store has not hydrated yet, or it is a fresh workspace) must leave the
 * timeline exactly as it was rather than stretching it to infinity or
 * collapsing it to zero.
 *
 * Only APPROVED entries count, via the same `countsAgainstCapacity` guard the
 * workload page and the assignment planner use: a timeline that quietly assumed
 * leave nobody has granted would quote a longer project off the back of a
 * request that may still be refused.
 */
export function buildTeamCalendar(
  members: CalendarMember[],
  entries: (AwayEntryLike & { start_date: string; end_date: string })[],
): TeamCalendar | null {
  // Truthiness, not `!== null`: `confirmed_at` is OPTIONAL, so an invitee who
  // never accepted has `undefined` and would have slipped through a null check
  // — counted as roster capacity they cannot supply. Same test
  // `useJoinedTeamMembers` uses, so "the team" means one thing everywhere.
  const roster = members.filter((m) => !m.deactivated_at && m.confirmed_at);
  const headcount = roster.length;
  if (headcount === 0) return null;

  const ids = new Set(roster.map((m) => m.id));
  // day → total absence weight. Overlapping entries for the SAME person are
  // deduped to their largest weight, so a partial day inside a full PTO block
  // does not subtract 1.5 people.
  const perDayPerson = new Map<string, Map<string, number>>();

  for (const e of entries) {
    if (!ids.has(e.user_id)) continue;
    if (!countsAgainstCapacity(e)) continue;
    const weight = e.kind === "partial" ? PARTIAL_DAY_WEIGHT : 1;
    for (const day of eachDay(e.start_date, e.end_date)) {
      const byPerson = perDayPerson.get(day) ?? new Map<string, number>();
      byPerson.set(e.user_id, Math.max(byPerson.get(e.user_id) ?? 0, weight));
      perDayPerson.set(day, byPerson);
    }
  }

  const factor = new Map<string, number>();
  for (const [day, byPerson] of perDayPerson) {
    let away = 0;
    for (const w of byPerson.values()) away += w;
    const available = Math.max(0, Math.min(1, (headcount - away) / headcount));
    if (available < 1) factor.set(day, available);
  }

  return { factor, headcount };
}

/** Inclusive `yyyy-mm-dd` walk, capped so a bad range cannot spin. */
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  let guard = 0;
  while (d <= last && guard < 400) {
    out.push(formatYmdLocal(d));
    d = addDays(d, 1);
    guard += 1;
  }
  return out;
}

/** Hard stop so a heavily-absent calendar cannot loop forever. */
const MAX_WALK_DAYS = 2000;

/**
 * `addBusinessDays`, minus the days nobody is working.
 *
 * Skips weekends and **US federal holidays**, then credits each remaining day by
 * how much of the team is available (1 when everybody is).
 *
 * ⚠️ Holidays apply even with NO calendar. A workspace with an empty roster
 * still does not work on Christmas, so the holiday skip cannot be conditional on
 * knowing who the team is — which is why this no longer short-circuits to
 * `addBusinessDays`. The walk itself is byte-identical to `addBusinessDays` over
 * a holiday-free window (verified across 40 offsets x 14 start days, weekend
 * starts included, in `e2e/team-calendar.spec.ts`).
 */
export function addWorkingDays(
  start: Date,
  businessDays: number,
  cal?: TeamCalendar | null,
): Date {
  // Matches `addBusinessDays(start, 0)`, which returns the start date untouched
  // even when it lands on a weekend.
  if (businessDays <= 0) return addBusinessDays(start, businessDays);

  let cursor = start;
  let credited = 0;
  let walked = 0;
  while (credited < businessDays - 1e-9 && walked < MAX_WALK_DAYS) {
    cursor = addDays(cursor, 1);
    walked += 1;
    if (isWeekend(cursor)) continue;
    const day = formatYmdLocal(cursor);
    if (isUsHoliday(day)) continue;
    credited += cal?.factor.get(day) ?? 1;
  }
  return cursor;
}

export interface TimelineShift {
  /** Calendar days later than a plain business-day count would have landed. */
  days: number;
  /** Observed holidays inside the span, in date order. */
  holidays: UsHoliday[];
  /** Whether booked time off also moved it — separately from the holidays. */
  fromPto: boolean;
}

/**
 * Why the dates moved, and by how much.
 *
 * Holidays and time off are reported **separately on purpose**: a manager can do
 * something about one of them and nothing at all about the other. "3 days later"
 * with no reason reads as a bug; "3 days later — Thanksgiving, and 1 day of
 * booked time off" is an answer.
 */
export function timelineShift(
  start: Date,
  businessDays: number,
  cal?: TeamCalendar | null,
): TimelineShift {
  const empty: TimelineShift = { days: 0, holidays: [], fromPto: false };
  if (businessDays <= 0) return empty;

  const plain = addBusinessDays(start, businessDays);
  const adjusted = addWorkingDays(start, businessDays, cal);
  const days = Math.max(
    0,
    Math.round((adjusted.getTime() - plain.getTime()) / 86_400_000),
  );

  // Holidays across the span the timeline ACTUALLY occupies, not the shorter
  // unadjusted one — a holiday near the end would otherwise fall outside the
  // window that reports it.
  const holidays = usHolidaysInRange(
    formatYmdLocal(start),
    formatYmdLocal(adjusted),
  );
  // Re-run with holidays only: anything still different is time off.
  const holidaysOnly = addWorkingDays(start, businessDays, null);
  return {
    days,
    holidays,
    fromPto: adjusted.getTime() !== holidaysOnly.getTime(),
  };
}


/* ────────────────────────────────────────────────────────────────────────── */
/*  Risk buffer                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Working days from `start` to `end`, counted the same way `addWorkingDays`
 * credits them — so `addWorkingDays(start, workingDaysBetween(start, end))`
 * lands back on `end`. Weekends, holidays and booked leave all count for what
 * they are worth.
 */
export function workingDaysBetween(
  startYmd: string,
  endYmd: string,
  cal?: TeamCalendar | null,
): number {
  if (!startYmd || !endYmd || endYmd <= startYmd) return 0;
  let cursor = new Date(`${startYmd}T12:00:00`);
  const last = new Date(`${endYmd}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return 0;

  let credited = 0;
  let walked = 0;
  while (cursor < last && walked < MAX_WALK_DAYS) {
    cursor = addDays(cursor, 1);
    walked += 1;
    if (isWeekend(cursor)) continue;
    const day = formatYmdLocal(cursor);
    if (isUsHoliday(day)) continue;
    credited += cal?.factor.get(day) ?? 1;
  }
  return Math.round(credited);
}

/**
 * Stretch a date range by a contingency percentage.
 *
 * The extra days are mapped back through `addWorkingDays`, so a buffer never
 * lands a finish date on a weekend, a holiday, or a week nobody is working.
 * Returns `null` when there is nothing to stretch.
 */
export function riskAdjustedFinish(
  startYmd: string,
  endYmd: string,
  riskBufferPct: number,
  cal?: TeamCalendar | null,
): string | null {
  const pct = Math.max(0, Math.min(100, Math.round(riskBufferPct)));
  const base = workingDaysBetween(startYmd, endYmd, cal);
  if (base <= 0) return null;
  if (pct === 0) return endYmd;
  const start = new Date(`${startYmd}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return formatYmdLocal(
    addWorkingDays(start, Math.round(base * (1 + pct / 100)), cal),
  );
}

/**
 * What applying a buffer would do to a project's sprints.
 *
 * Every sprint is re-anchored against the project's own start, so the plan
 * slides out **proportionally** and stays continuous — buffering only the end
 * dates would have each sprint finish later while the next still began on its
 * original day, overlapping them.
 *
 * Returns only the sprints that actually move, and writes nothing: the caller
 * shows these and a human confirms, the same shape as every other schedule
 * change in this app.
 */
export function bufferSprintDates(
  sprints: { id: string; name: string; start_date: string; end_date: string }[],
  riskBufferPct: number,
  cal?: TeamCalendar | null,
): { id: string; name: string; from: { start: string; end: string }; to: { start: string; end: string } }[] {
  const pct = Math.max(0, Math.min(100, Math.round(riskBufferPct)));
  if (pct === 0 || !sprints.length) return [];

  const anchor = sprints.reduce(
    (min, s) => (s.start_date && s.start_date < min ? s.start_date : min),
    sprints[0].start_date,
  );
  const anchorDate = new Date(`${anchor}T12:00:00`);
  if (Number.isNaN(anchorDate.getTime())) return [];
  const scale = 1 + pct / 100;

  const out = [];
  for (const s of sprints) {
    const startOff = workingDaysBetween(anchor, s.start_date, cal);
    const endOff = workingDaysBetween(anchor, s.end_date, cal);
    const to = {
      start: formatYmdLocal(
        addWorkingDays(anchorDate, Math.round(startOff * scale), cal),
      ),
      end: formatYmdLocal(
        addWorkingDays(anchorDate, Math.round(endOff * scale), cal),
      ),
    };
    if (to.start !== s.start_date || to.end !== s.end_date) {
      out.push({
        id: s.id,
        name: s.name,
        from: { start: s.start_date, end: s.end_date },
        to,
      });
    }
  }
  return out;
}
