/** Parse YYYY-MM-DD as a local calendar date at noon (avoids UTC shift). */
export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every calendar day from start through end, inclusive (YYYY-MM-DD). */
export function eachYmdInInclusiveRange(start: string, end: string): string[] {
  const a = parseYmdLocal(start);
  const b = parseYmdLocal(end);
  if (a > b) return [];
  const out: string[] = [];
  const cur = new Date(a);
  while (cur <= b) {
    out.push(formatYmdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * The calendar-grid key for a stored date: which day cell it belongs in.
 *
 * A DATE column (`due_date`, `start_date`, `end_date`) arrives as
 * "YYYY-MM-DD" and already IS the key. Running it through `new Date()` reads it
 * as midnight **UTC**, which is the previous evening anywhere west of Greenwich
 * — a task due the 21st then rendered on the 20th. Verified in the browser: the
 * same task landed on the 21st in Asia/Manila and the 20th in America/New_York,
 * while PTO on the very same grid was keyed correctly.
 *
 * A genuine timestamp (with a time part) is converted to its LOCAL day, which
 * is what someone reading a calendar means by "that day".
 */
export function calendarDayKey(iso: string): string {
  return iso.includes("T") ? formatYmdLocal(new Date(iso)) : iso.slice(0, 10);
}

export function ymdCompare(a: string, b: string): number {
  return a.localeCompare(b);
}
