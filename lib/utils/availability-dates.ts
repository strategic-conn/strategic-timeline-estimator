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

export function ymdCompare(a: string, b: string): number {
  return a.localeCompare(b);
}
