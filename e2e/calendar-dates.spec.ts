import { expect, test } from "@playwright/test";

import {
  calendarDayKey,
  eachYmdInInclusiveRange,
  formatYmdLocal,
  parseYmdLocal,
} from "../lib/utils/availability-dates";

/**
 * Which day cell a stored date belongs in. Pure — no browser, no network.
 *
 * The calendar keyed tasks and sprint boundaries with `new Date(iso)`, which
 * reads a DATE column as midnight UTC. Proven in a real browser: a task due
 * 2026-08-21 rendered on the 21st in Asia/Manila and the **20th** in
 * America/New_York — while PTO on the same grid was keyed correctly, so two
 * data sources on one view disagreed about what day it was.
 */
test.describe("calendarDayKey", () => {
  test("a date-only value is already the key", () => {
    expect(calendarDayKey("2026-08-21")).toBe("2026-08-21");
    expect(calendarDayKey("2026-01-01")).toBe("2026-01-01");
    expect(calendarDayKey("2026-12-31")).toBe("2026-12-31");
  });

  test("it never shifts a day, whatever the timezone", () => {
    // The failure it replaces was `new Date("2026-08-21")` → UTC midnight →
    // the 20th anywhere west of Greenwich. A pure string can't do that.
    for (const d of ["2026-03-01", "2026-06-15", "2026-11-30"]) {
      expect(calendarDayKey(d)).toBe(d);
    }
  });

  test("a real timestamp becomes its LOCAL day", () => {
    const noon = "2026-08-21T12:00:00";
    expect(calendarDayKey(noon)).toBe(formatYmdLocal(new Date(noon)));
  });
});

test.describe("the PTO range helper agrees with it", () => {
  test("a single-day entry keys to that day", () => {
    expect(eachYmdInInclusiveRange("2026-07-02", "2026-07-02")).toEqual([
      "2026-07-02",
    ]);
  });

  test("a range is inclusive at both ends", () => {
    expect(eachYmdInInclusiveRange("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  test("a backwards range yields nothing rather than looping", () => {
    expect(eachYmdInInclusiveRange("2026-09-05", "2026-09-01")).toEqual([]);
  });

  test("PTO and task keys use the same day for the same date", () => {
    // The two sources that used to disagree.
    const day = "2026-08-21";
    expect(eachYmdInInclusiveRange(day, day)[0]).toBe(calendarDayKey(day));
    expect(formatYmdLocal(parseYmdLocal(day))).toBe(calendarDayKey(day));
  });
});
