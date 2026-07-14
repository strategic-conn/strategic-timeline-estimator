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
