/**
 * US federal holidays — the days this workspace does not work.
 *
 * Pure and dependency-free, and NOT part of `availability_entries`: a holiday is
 * not anybody's leave. Nobody requests it, nobody approves it, and it reduces
 * everyone's capacity at once. Modelling it as PTO would have meant writing
 * eleven rows per person per year and letting somebody "reject" Christmas.
 *
 * Lives in its own folder because three unrelated things consume it: the
 * timeline generator (`addWorkingDays`), weekly capacity (`awayWorkdaysInWeek`)
 * and the calendar UI. One definition, per CLAUDE.md rule 8.
 */

export interface UsHoliday {
  /** The date it is OBSERVED, `yyyy-mm-dd` — not always the date it falls on. */
  date: string;
  name: string;
  /** The calendar date it actually falls on, when that differs from `date`. */
  actual?: string;
}

/**
 * The eleven federal holidays, as observed by this workspace — and the rule for
 * finding each one.
 *
 * ⚠️ This list DRIVES the computation; it is not a parallel description of it.
 * The first version kept a names-only array beside two hardcoded date tables, so
 * "changing it is one line" was untrue — dropping Columbus Day meant editing two
 * places, and only the TypeScript union would have caught the mismatch.
 *
 * ponytail: still one list, no settings table. Firms differ most on **Columbus
 * Day** and **Veterans Day** — plenty work both. Deleting a line here is now
 * genuinely all it takes. If it ever needs to vary per workspace, this is the
 * seam.
 */
type HolidayRule =
  /** A fixed calendar date: month is 0-based. Subject to the observance rule. */
  | { kind: "fixed"; month: number; day: number }
  /** The nth `weekday` of `month` (0=Sun). Always a weekday, so never shifted. */
  | { kind: "nth"; month: number; weekday: number; n: number }
  /** The last `weekday` of `month`. Likewise never shifted. */
  | { kind: "last"; month: number; weekday: number };

export const OBSERVED_HOLIDAYS: readonly (readonly [string, HolidayRule])[] = [
  ["New Year's Day", { kind: "fixed", month: 0, day: 1 }],
  ["Martin Luther King Jr. Day", { kind: "nth", month: 0, weekday: 1, n: 3 }],
  ["Presidents' Day", { kind: "nth", month: 1, weekday: 1, n: 3 }],
  ["Memorial Day", { kind: "last", month: 4, weekday: 1 }],
  ["Juneteenth", { kind: "fixed", month: 5, day: 19 }],
  ["Independence Day", { kind: "fixed", month: 6, day: 4 }],
  ["Labor Day", { kind: "nth", month: 8, weekday: 1, n: 1 }],
  ["Columbus Day", { kind: "nth", month: 9, weekday: 1, n: 2 }],
  ["Veterans Day", { kind: "fixed", month: 10, day: 11 }],
  ["Thanksgiving", { kind: "nth", month: 10, weekday: 4, n: 4 }],
  ["Christmas Day", { kind: "fixed", month: 11, day: 25 }],
] as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function shift(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** e.g. the 3rd Monday of January. `weekday` is 0=Sun … 6=Sat. */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** e.g. the last Monday of May. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const back = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - back);
}

/**
 * The federal observance rule (5 U.S.C. 6103): a holiday landing on Saturday is
 * taken the Friday before, on Sunday the Monday after.
 *
 * ⚠️ Skipping this gets roughly two holidays a year wrong — and always the two
 * people notice, because they are the ones that move. July 4 2026 is a Saturday
 * and the office is shut on Friday the 3rd; Christmas 2027 is a Saturday and the
 * office is shut on Friday the 24th.
 *
 * Only the FIXED-date holidays can need it. The Monday/Thursday ones are defined
 * as a weekday, so they never land on a weekend in the first place.
 */
function observedDate(d: Date): Date {
  const dow = d.getDay();
  if (dow === 6) return shift(d, -1);
  if (dow === 0) return shift(d, 1);
  return d;
}

function buildYear(year: number): UsHoliday[] {
  const out: UsHoliday[] = [];
  for (const [name, rule] of OBSERVED_HOLIDAYS) {
    if (rule.kind === "fixed") {
      const actual = new Date(year, rule.month, rule.day);
      const obs = observedDate(actual);
      const shifted = ymd(obs) !== ymd(actual);
      out.push({ name, date: ymd(obs), ...(shifted ? { actual: ymd(actual) } : {}) });
    } else if (rule.kind === "nth") {
      out.push({
        name,
        date: ymd(nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n)),
      });
    } else {
      out.push({ name, date: ymd(lastWeekdayOfMonth(year, rule.month, rule.weekday)) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Computing a year is cheap; looking one up is not, if done naively.
 *
 * `isUsHoliday` runs INSIDE the day-by-day walks (`addWorkingDays` up to 2000
 * iterations, `isWorkday` in the planner, `awayWorkdaysInWeek` per member per
 * render). Scanning three years x eleven holidays per day was ~33 string
 * comparisons a step; the index makes it one map lookup.
 */
const yearCache = new Map<number, UsHoliday[]>();
/** `yyyy-mm-dd` to name, for every year built so far. */
const observedIndex = new Map<string, string>();

export function usHolidaysForYear(year: number): UsHoliday[] {
  let cached = yearCache.get(year);
  if (!cached) {
    cached = buildYear(year);
    yearCache.set(year, cached);
    for (const h of cached) observedIndex.set(h.date, h.name);
  }
  return cached;
}

/**
 * Every observed holiday between two `yyyy-mm-dd` dates, inclusive.
 *
 * ⚠️ Scans one year either side of the range on purpose: New Year's Day can be
 * observed in the PREVIOUS December. Jan 1 2028 is a Saturday, so that holiday
 * falls on 2027-12-31 — building only the years the range names would miss it.
 */
export function usHolidaysInRange(startYmd: string, endYmd: string): UsHoliday[] {
  if (!startYmd || !endYmd || endYmd < startYmd) return [];
  const first = Number(startYmd.slice(0, 4));
  const last = Number(endYmd.slice(0, 4));
  if (!Number.isFinite(first) || !Number.isFinite(last)) return [];

  const out: UsHoliday[] = [];
  for (let y = first - 1; y <= last + 1; y++) {
    for (const h of usHolidaysForYear(y)) {
      if (h.date >= startYmd && h.date <= endYmd) out.push(h);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** `yyyy-mm-dd` → holiday name, for a range. Empty when the range is empty. */
export function usHolidayMap(startYmd: string, endYmd: string): Map<string, string> {
  return new Map(usHolidaysInRange(startYmd, endYmd).map((h) => [h.date, h.name]));
}

/**
 * Is this `yyyy-mm-dd` an observed holiday? Memoised per year, so the
 * day-by-day walks in `addWorkingDays` and `awayWorkdaysInWeek` can call it
 * freely.
 */
export function isUsHoliday(dayYmd: string): boolean {
  return usHolidayName(dayYmd) !== null;
}

export function usHolidayName(dayYmd: string): string | null {
  const year = Number(dayYmd.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  // Index the neighbouring years too: an observed date can sit in either, since
  // New Year's Day can land in the previous December.
  usHolidaysForYear(year);
  usHolidaysForYear(year - 1);
  usHolidaysForYear(year + 1);
  return observedIndex.get(dayYmd) ?? null;
}
