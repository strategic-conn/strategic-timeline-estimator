import { expect, test } from "@playwright/test";

import {
  awayWorkdaysInWeek,
  capacityAfterTimeOff,
  type AwayEntryLike,
} from "../lib/constants/workload";

/**
 * Time off against weekly capacity. Pure — no browser, no network.
 *
 * Workload used to plan as if nobody was ever away: `availability_entries` was
 * read by the Calendar and Settings only, so a person on leave all week still
 * showed a full 40h to fill and could never trip the "over capacity" flag.
 */

// Week of Mon 31 Aug – Sun 6 Sep 2026. Wednesday is 2 Sep.
const WED = new Date(2026, 8, 2, 10, 0);
const ME = "me";

const entry = (
  start: string,
  end: string,
  kind: AwayEntryLike["kind"] = "pto",
  user_id = ME,
): AwayEntryLike => ({ user_id, start_date: start, end_date: end, kind });

test.describe("awayWorkdaysInWeek", () => {
  test("no entries means no days away", () => {
    expect(awayWorkdaysInWeek([], ME, WED)).toBe(0);
  });

  test("a single day inside the week counts once", () => {
    expect(awayWorkdaysInWeek([entry("2026-09-02", "2026-09-02")], ME, WED)).toBe(1);
  });

  test("a full Mon–Fri block is five days", () => {
    expect(awayWorkdaysInWeek([entry("2026-08-31", "2026-09-04")], ME, WED)).toBe(5);
  });

  test("weekend days are NOT counted", () => {
    // Sat 5 + Sun 6 Sep: nobody was going to work those, so charging capacity
    // for them would understate what the person can take on.
    expect(awayWorkdaysInWeek([entry("2026-09-05", "2026-09-06")], ME, WED)).toBe(0);
    // A Fri–Mon block spans one weekend: only Fri (4th) is in THIS week.
    expect(awayWorkdaysInWeek([entry("2026-09-04", "2026-09-07")], ME, WED)).toBe(1);
  });

  test("days outside the week are ignored", () => {
    expect(awayWorkdaysInWeek([entry("2026-09-14", "2026-09-18")], ME, WED)).toBe(0);
    expect(awayWorkdaysInWeek([entry("2026-08-24", "2026-08-28")], ME, WED)).toBe(0);
  });

  test("a range straddling the week edge counts only the days inside", () => {
    // Thu 27 Aug → Tue 1 Sep: Mon 31 Aug and Tue 1 Sep fall in this week.
    expect(awayWorkdaysInWeek([entry("2026-08-27", "2026-09-01")], ME, WED)).toBe(2);
  });

  test("only this member's entries count", () => {
    const someoneElse = entry("2026-08-31", "2026-09-04", "pto", "other");
    expect(awayWorkdaysInWeek([someoneElse], ME, WED)).toBe(0);
  });

  test("a partial day is half a day", () => {
    expect(awayWorkdaysInWeek([entry("2026-09-02", "2026-09-02", "partial")], ME, WED)).toBe(0.5);
  });

  test("overlapping entries are deduped, taking the larger weight", () => {
    // A partial day inside a full PTO block is one full day, not 1.5.
    expect(
      awayWorkdaysInWeek(
        [entry("2026-09-02", "2026-09-02", "partial"), entry("2026-09-02", "2026-09-02", "pto")],
        ME,
        WED,
      ),
    ).toBe(1);
    // Two identical full-day entries are still one day.
    expect(
      awayWorkdaysInWeek(
        [entry("2026-09-01", "2026-09-02"), entry("2026-09-02", "2026-09-03")],
        ME,
        WED,
      ),
    ).toBe(3);
  });

  test("`unavailable` counts like PTO", () => {
    expect(awayWorkdaysInWeek([entry("2026-09-02", "2026-09-02", "unavailable")], ME, WED)).toBe(1);
  });
});

test.describe("capacityAfterTimeOff", () => {
  test("no time off leaves capacity untouched", () => {
    expect(capacityAfterTimeOff(40, 0)).toBe(40);
  });

  test("a day off removes a fifth of the week", () => {
    expect(capacityAfterTimeOff(40, 1)).toBe(32);
    expect(capacityAfterTimeOff(40, 2)).toBe(24);
    expect(capacityAfterTimeOff(25, 1)).toBe(20);
  });

  test("a half day removes half of that", () => {
    expect(capacityAfterTimeOff(40, 0.5)).toBe(36);
  });

  test("a full week away leaves nothing to fill", () => {
    expect(capacityAfterTimeOff(40, 5)).toBe(0);
  });

  test("it never goes negative", () => {
    expect(capacityAfterTimeOff(40, 7)).toBe(0);
    expect(capacityAfterTimeOff(0, 3)).toBe(0);
  });

  test("it scales with a non-default capacity", () => {
    // Someone contracted for 20h/week loses 4h per day off, not 8.
    expect(capacityAfterTimeOff(20, 1)).toBe(16);
    expect(capacityAfterTimeOff(20, 5)).toBe(0);
  });
});
