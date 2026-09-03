import { expect, test } from "@playwright/test";

import { daysUntil, isOverdue, relativeDay } from "../lib/utils/relative-dates";

/**
 * The dashboard's date maths. Pure — no browser, no network.
 *
 * These exist because the original implementation subtracted a packed
 * `YYYYMMDD` integer and treated the result as a day count. That is only true
 * within a single month, so the dashboard's "due in the next 7 days" list and
 * its Today/Yesterday labels were quietly wrong for a few days every month.
 */

const at = (s: string) => new Date(s + "T09:00:00");

test.describe("daysUntil", () => {
  test("counts days inside a month", () => {
    expect(daysUntil("2026-09-09", at("2026-09-02"))).toBe(7);
    expect(daysUntil("2026-09-02", at("2026-09-02"))).toBe(0);
    expect(daysUntil("2026-09-01", at("2026-09-02"))).toBe(-1);
  });

  test("counts days ACROSS a month boundary", () => {
    // The old maths: 20261001 - 20260928 = 73. A task due in 3 days therefore
    // failed the "<= 7" window and never appeared on the dashboard.
    expect(daysUntil("2026-10-01", at("2026-09-28"))).toBe(3);
    expect(daysUntil("2026-09-30", at("2026-10-01"))).toBe(-1);
    expect(daysUntil("2026-03-01", at("2026-02-27"))).toBe(2);
  });

  test("counts days across a year boundary", () => {
    // The old maths: 20270101 - 20261231 = 8870.
    expect(daysUntil("2027-01-01", at("2026-12-31"))).toBe(1);
    expect(daysUntil("2026-12-31", at("2027-01-02"))).toBe(-2);
  });

  test("ignores time of day", () => {
    expect(daysUntil("2026-09-03T23:59:00", new Date("2026-09-03T00:01:00"))).toBe(0);
    expect(daysUntil("2026-09-04T00:01:00", new Date("2026-09-03T23:59:00"))).toBe(1);
  });
});

test.describe("relativeDay", () => {
  test("names the days either side of today", () => {
    expect(relativeDay("2026-09-02", at("2026-09-02"))).toBe("Today");
    expect(relativeDay("2026-09-03", at("2026-09-02"))).toBe("Tomorrow");
    expect(relativeDay("2026-09-01", at("2026-09-02"))).toBe("Yesterday");
    expect(relativeDay("2026-08-30", at("2026-09-02"))).toBe("3 days ago");
  });

  test("does not invent months of lateness at a boundary", () => {
    // The bug as a user saw it: yesterday's task labelled "71 days ago".
    expect(relativeDay("2026-09-30", at("2026-10-01"))).toBe("Yesterday");
    expect(relativeDay("2026-12-31", at("2027-01-01"))).toBe("Yesterday");
    expect(relativeDay("2026-09-28", at("2026-10-01"))).toBe("3 days ago");
  });

  test("falls back to a weekday further out", () => {
    // Deliberately loose: the exact string is locale-dependent.
    expect(relativeDay("2026-10-05", at("2026-10-01"))).toMatch(/^[A-Za-z]{3}$/);
  });
});

/**
 * `isOverdue` is shared by Reports, both Workload views and the dashboard.
 * Each used to hand-roll `new Date(due) < now`, which treats a DATE column as
 * midnight UTC — so a task due TODAY read as overdue from 08:00 local here, and
 * from the previous evening in a negative-offset zone. Reports showed 7 overdue
 * where 6 were late, while the dashboard called the same task "Today".
 */
test.describe("isOverdue", () => {
  test("a task due today is NOT overdue, at any hour", () => {
    for (const hour of [0, 1, 8, 12, 20, 23]) {
      const now = new Date(2026, 8, 2, hour, 30); // 2 Sep 2026, local
      expect(isOverdue("2026-09-02", now), `at ${hour}:30`).toBe(false);
    }
  });

  test("yesterday is overdue, tomorrow is not", () => {
    const now = new Date(2026, 8, 2, 9, 0);
    expect(isOverdue("2026-09-01", now)).toBe(true);
    expect(isOverdue("2026-09-03", now)).toBe(false);
  });

  test("it holds across month and year boundaries", () => {
    expect(isOverdue("2026-09-30", new Date(2026, 9, 1, 9, 0))).toBe(true);
    expect(isOverdue("2026-10-01", new Date(2026, 9, 1, 9, 0))).toBe(false);
    expect(isOverdue("2026-12-31", new Date(2027, 0, 1, 9, 0))).toBe(true);
    expect(isOverdue("2027-01-01", new Date(2027, 0, 1, 23, 59))).toBe(false);
  });

  test("no due date is never overdue", () => {
    const now = new Date(2026, 8, 2);
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue(undefined, now)).toBe(false);
    expect(isOverdue("", now)).toBe(false);
  });

  test("a date-only string is read as LOCAL midnight, not UTC", () => {
    // The bug underneath all of the above: `new Date("2026-09-02")` is UTC
    // midnight, so its local calendar day can be the 1st or the 2nd depending
    // on the timezone. `daysUntil` must not care.
    expect(daysUntil("2026-09-02", new Date(2026, 8, 2, 0, 1))).toBe(0);
    expect(daysUntil("2026-09-02", new Date(2026, 8, 2, 23, 59))).toBe(0);
  });
});
