/** Round work hours to 2 decimal places (avoids float noise from timers and JS math). */
export function roundWorkHours(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Display work hours for UI (up to 2 fraction digits, locale-aware). */
export function formatWorkHours(n?: number | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(roundWorkHours(n));
}
