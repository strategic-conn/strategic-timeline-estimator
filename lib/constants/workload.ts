import { isUsHoliday } from "@/lib/calendar/us-holidays";

/**
 * Default hours per person per week when no override is stored.
 * Per-user values live in `useWeeklyCapacityStore` (Supabase `weekly_capacity`; demo fallback).
 */
export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

/** Monday 00:00 (local) of the current week, ISO — the "this week" window for time_entries. */
export function startOfWeekIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString();
}

/** Working days in a week — the divisor for turning a weekly figure into a daily one. */
export const WORKDAYS_PER_WEEK = 5;

/**
 * A "partial day" counts as half a day away.
 *
 * The `partial` availability kind carries no hours of its own, so this is an
 * assumption, not a measurement. Half a day is the least surprising reading of
 * "partial"; if the team means something else, give the entry an hours field
 * rather than changing this constant, because the honest fix is to record what
 * actually happened.
 */
export const PARTIAL_DAY_WEIGHT = 0.5;

/** Monday 00:00 local of the week containing `now`. */
function mondayOf(now: Date | number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type AwayEntryLike = {
  user_id: string;
  /** Inclusive, YYYY-MM-DD */
  start_date: string;
  /** Inclusive, YYYY-MM-DD */
  end_date: string;
  kind: "pto" | "unavailable" | "partial";
  /** Absent on rows written before migration 0034 — those were already in force. */
  status?: "pending" | "approved" | "rejected";
};

/**
 * Whether an entry actually removes someone from the roster.
 *
 * Guarded HERE rather than at each call site, so nothing can forget: a merely
 * requested absence must not shrink someone's capacity, must not be fed to the
 * assignment planner, and must not make a manager re-plan a sprint around leave
 * that has not been granted. A missing status means the row predates 0034,
 * when every entry was in force the moment it was saved.
 */
export function countsAgainstCapacity(entry: { status?: string | null }): boolean {
  return (entry.status ?? "approved") === "approved";
}

/**
 * How many working days this member is away during the week containing `now`.
 *
 * Counts **Mon–Fri only**: deducting capacity for a Saturday in someone's leave
 * range would charge them for a day they were never going to work. Overlapping
 * entries are deduped per day and take the larger weight, so a partial day that
 * also falls inside a full PTO block counts once, as a full day.
 *
 * Pending and rejected requests are skipped — see `countsAgainstCapacity`. So
 * are US holidays, which `holidayWorkdaysInWeek` counts instead.
 */
export function awayWorkdaysInWeek(
  entries: AwayEntryLike[],
  memberId: string,
  now: Date | number,
): number {
  const monday = mondayOf(now);
  const weight = new Map<string, number>();

  for (let i = 0; i < WORKDAYS_PER_WEEK; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = ymdLocal(day);
    // A holiday is already off everyone's week (`holidayWorkdaysInWeek`), so
    // leave booked across one must not subtract it a second time — a week
    // containing Christmas cannot cost six days out of five.
    if (isUsHoliday(key)) continue;
    for (const e of entries) {
      if (e.user_id !== memberId) continue;
      if (!countsAgainstCapacity(e)) continue;
      if (key < e.start_date || key > e.end_date) continue;
      const w = e.kind === "partial" ? PARTIAL_DAY_WEIGHT : 1;
      weight.set(key, Math.max(weight.get(key) ?? 0, w));
    }
  }
  let total = 0;
  for (const w of weight.values()) total += w;
  return total;
}

/**
 * Observed US holidays falling Mon–Fri in the week containing `now`.
 *
 * Counted separately from leave because the two are different facts: one is a
 * person's choice that a manager can decline, the other is the office being
 * shut. The workload pages say which is which rather than lumping both into
 * "days off".
 */
export function holidayWorkdaysInWeek(now: Date | number): number {
  const monday = mondayOf(now);
  let total = 0;
  for (let i = 0; i < WORKDAYS_PER_WEEK; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    if (isUsHoliday(ymdLocal(day))) total += 1;
  }
  return total;
}

/**
 * Weekly capacity with time off removed — what this person can actually take on.
 *
 * Workload previously planned as if nobody was ever away: a person on leave all
 * week still showed a full 40h to fill, so the utilisation bar and the "over
 * capacity" flag were blind to the one thing that most changes availability.
 */
export function capacityAfterTimeOff(
  weeklyHours: number,
  awayWorkdays: number,
): number {
  if (weeklyHours <= 0) return 0;
  const perDay = weeklyHours / WORKDAYS_PER_WEEK;
  return Math.max(0, Math.round((weeklyHours - awayWorkdays * perDay) * 10) / 10);
}
