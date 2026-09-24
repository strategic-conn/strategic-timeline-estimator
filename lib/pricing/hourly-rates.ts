import { z } from "zod";

/**
 * Hourly rates by Responsible + Level — the pure half (no store, no network).
 *
 * The table lives in `hourly_rates` (migration 0042). Nothing prices from it
 * yet: the Estimator switches over in Phase 3 of docs/pricing-levels-plan.md,
 * when each line snapshots the rate it was priced at, so editing a rate never
 * reprices an existing quote.
 */

export type RateLevel = 1 | 2;

export interface HourlyRate {
  responsible: string;
  level: RateLevel;
  rate: number;
  updated_by: string | null;
  updated_at: string | null;
}

/**
 * The roles in the workbook, in its order. Display order only — the table's
 * text key means a future role needs no migration.
 */
export const RESPONSIBLE_ROLES = [
  "IT",
  "Creative",
  "Project Manager",
  "QA Tester",
  "Project Coordinator",
] as const;

/** Upper bound matches the column's CHECK constraint in 0042. */
export const MAX_HOURLY_RATE = 10_000;

/**
 * Workbook v3 → Rates tab. Seeds demo mode; the live table was seeded with the
 * same numbers by 0042. Project Coordinator is $0 on purpose (non-billable).
 */
export const DEFAULT_HOURLY_RATES: HourlyRate[] = (
  [
    ["IT", 1, 100],
    ["IT", 2, 120],
    ["Creative", 1, 100],
    ["Creative", 2, 130],
    ["Project Manager", 1, 80],
    ["Project Manager", 2, 100],
    ["QA Tester", 1, 80],
    ["QA Tester", 2, 120],
    ["Project Coordinator", 1, 0],
    ["Project Coordinator", 2, 0],
  ] as const
).map(([responsible, level, rate]) => ({
  responsible,
  level,
  rate,
  updated_by: null,
  updated_at: null,
}));

/** The workbook's own lookup key: "IT|Level 2". */
export function rateKey(responsible: string, level: RateLevel): string {
  return `${responsible}|Level ${level}`;
}

/** `rateKey` inverted: "IT|Level 2" → { IT, 2 }; anything else → null. */
export function parseRateKey(
  key: string,
): { responsible: string; level: RateLevel } | null {
  const m = /^(.+)\|Level ([12])$/.exec(key);
  return m ? { responsible: m[1], level: Number(m[2]) as RateLevel } : null;
}

/** The rate for a role + level, or null when the table has no such row. */
export function rateFor(
  rates: HourlyRate[],
  responsible: string,
  level: RateLevel,
): number | null {
  const row = rates.find(
    (r) => r.responsible === responsible && r.level === level,
  );
  return row ? row.rate : null;
}

/** Known roles first in workbook order, then anything else alphabetically. */
export function sortRates(rates: HourlyRate[]): HourlyRate[] {
  const order = (r: string) => {
    const i = (RESPONSIBLE_ROLES as readonly string[]).indexOf(r);
    return i === -1 ? RESPONSIBLE_ROLES.length : i;
  };
  return [...rates].sort(
    (a, b) =>
      order(a.responsible) - order(b.responsible) ||
      a.responsible.localeCompare(b.responsible) ||
      a.level - b.level,
  );
}

/** One edited cell, as typed. Strings, because an input can hold "" or "12.". */
const rateInput = z
  .string()
  .trim()
  .min(1, "Enter a rate")
  .regex(/^\d+(\.\d{1,2})?$/, "Use a number with up to 2 decimals")
  .transform(Number)
  .refine(
    (n) => n <= MAX_HOURLY_RATE,
    `Must be $${MAX_HOURLY_RATE.toLocaleString()} or less`,
  );

export type RateDraft = Record<string, string>; // rateKey -> typed value

/**
 * Validate a whole edited table. Returns per-cell errors (keyed like the draft)
 * and the parsed numbers when everything is valid.
 *
 * ⚠️ "Level 2 must not be below Level 1" is checked HERE, across the whole
 * table, rather than as a database trigger: raising both levels of a role one
 * row at a time would briefly break a row-level rule and be refused half-way.
 * EQUAL is allowed — Project Coordinator is $0 at both levels.
 */
export function validateRateDraft(
  roles: string[],
  draft: RateDraft,
): { errors: Record<string, string>; parsed: Record<string, number> | null } {
  const errors: Record<string, string> = {};
  const parsed: Record<string, number> = {};

  for (const role of roles) {
    for (const level of [1, 2] as const) {
      const key = rateKey(role, level);
      const res = rateInput.safeParse(draft[key] ?? "");
      if (res.success) parsed[key] = res.data;
      else errors[key] = res.error.issues[0]?.message ?? "Invalid rate";
    }
    const l1 = parsed[rateKey(role, 1)];
    const l2 = parsed[rateKey(role, 2)];
    if (l1 !== undefined && l2 !== undefined && l2 < l1) {
      errors[rateKey(role, 2)] = "Level 2 can't be below Level 1";
    }
  }

  return { errors, parsed: Object.keys(errors).length ? null : parsed };
}

/** Display a rate as money: "$120", "$87.50", "$0". */
export function formatRate(rate: number): string {
  return `$${rate.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(rate) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
