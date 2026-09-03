import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Whole calendar days from `now` until `iso` — negative when it's already past.
 *
 * Wraps date-fns rather than doing the arithmetic, because the obvious hand-
 * rolled version is wrong: packing a date as `YYYY*10000 + MM*100 + DD` and
 * subtracting only counts days *inside one month*. Across a boundary it blows
 * up — 1 Oct minus 30 Sep gives 71, and 1 Jan minus 31 Dec gives 8,870 — so a
 * "next 7 days" window silently dropped everything in the following month, and
 * "yesterday" rendered as "71 days ago". date-fns also gets DST right, which
 * subtracting raw milliseconds does not.
 *
 * `now` is a parameter, never the clock: these labels render on the server too,
 * and one read against a different instant than the list it sits in gives a
 * hydration mismatch and a row that contradicts its own count.
 *
 * Parsed with `parseISO`, not `new Date`. `due_date` is a DATE column, and
 * `new Date("2026-09-02")` reads that as midnight **UTC** — 08:00 here, 19:00
 * the previous day in New York. `parseISO` gives local midnight for a date-only
 * string, which is what "due that day" means to the person reading it, and
 * still handles a full timestamp correctly.
 */
export function daysUntil(iso: string, now: number | Date): number {
  return differenceInCalendarDays(parseISO(iso), now);
}

/**
 * Is this due date genuinely past — by whole calendar days, not by the clock?
 *
 * Reports, Workload and the dashboard each hand-rolled `new Date(due) < now`,
 * which marks a task due TODAY as overdue the moment UTC midnight passes.
 * Reports showed 7 overdue where only 6 were late, while the dashboard called
 * the very same task "Today". One helper so the three cannot disagree.
 */
export function isOverdue(
  iso: string | null | undefined,
  now: number | Date,
): boolean {
  return Boolean(iso) && daysUntil(iso as string, now) < 0;
}

/** A due date as people say it: Today, Tomorrow, Yesterday, "3 days ago", "Fri". */
export function relativeDay(iso: string, now: number | Date): string {
  const diff = daysUntil(iso, now);
  if (diff < -1) return `${Math.abs(diff)} days ago`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}
