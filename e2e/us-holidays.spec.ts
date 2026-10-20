import { expect, test } from "@playwright/test";
import { format } from "date-fns";

import {
  federalHolidaysForYear,
  isUsHoliday,
  setWorkingHolidays,
  usHolidayName,
  usHolidaysForYear,
  usHolidaysInRange,
} from "../lib/calendar/us-holidays";

/**
 * US federal holidays. Pure — no browser, no network.
 *
 * The dates below are the real ones, checked against the calendar. They are
 * spelled out rather than recomputed by the test, because a test that derives
 * its expectation the same way the code does proves only that the code is
 * self-consistent.
 */
const on = (ymd: string) => format(new Date(`${ymd}T12:00:00`), "EEE");
const dates = (year: number) =>
  Object.fromEntries(usHolidaysForYear(year).map((h) => [h.name, h.date]));

test.describe("the eleven federal holidays", () => {
  test("2026 lands where it should", () => {
    expect(dates(2026)).toEqual({
      "New Year's Day": "2026-01-01",
      "Martin Luther King Jr. Day": "2026-01-19",
      "Presidents' Day": "2026-02-16",
      "Memorial Day": "2026-05-25",
      Juneteenth: "2026-06-19",
      // July 4 2026 is a Saturday → observed the Friday before.
      "Independence Day": "2026-07-03",
      "Labor Day": "2026-09-07",
      "Columbus Day": "2026-10-12",
      "Veterans Day": "2026-11-11",
      Thanksgiving: "2026-11-26",
      "Christmas Day": "2026-12-25",
    });
  });

  test("every observed date is a weekday", () => {
    // The whole point of the observance rule. If one of these lands on a
    // weekend the rule is not being applied.
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      for (const h of usHolidaysForYear(year)) {
        expect(["Sat", "Sun"], `${h.name} ${h.date}`).not.toContain(on(h.date));
      }
    }
  });

  test("floating holidays are the right ordinal weekday", () => {
    expect(on(dates(2027)["Martin Luther King Jr. Day"])).toBe("Mon");
    expect(dates(2027)["Martin Luther King Jr. Day"]).toBe("2027-01-18");
    // Last Monday of May, not the fourth — May 2027 has five.
    expect(dates(2027)["Memorial Day"]).toBe("2027-05-31");
    expect(on(dates(2027).Thanksgiving)).toBe("Thu");
    expect(dates(2027).Thanksgiving).toBe("2027-11-25");
  });
});

test.describe("the observance rule", () => {
  test("Saturday moves back to Friday", () => {
    const y2027 = usHolidaysForYear(2027);
    const xmas = y2027.find((h) => h.name === "Christmas Day")!;
    expect(xmas.date).toBe("2027-12-24");
    expect(xmas.actual, "the day it really falls on is kept").toBe("2027-12-25");
    expect(on("2027-12-25")).toBe("Sat");
  });

  test("Sunday moves forward to Monday", () => {
    const july = usHolidaysForYear(2027).find((h) => h.name === "Independence Day")!;
    expect(july.date).toBe("2027-07-05");
    expect(july.actual).toBe("2027-07-04");
    expect(on("2027-07-04")).toBe("Sun");
  });

  test("a weekday holiday is not moved, and carries no `actual`", () => {
    const vets = usHolidaysForYear(2026).find((h) => h.name === "Veterans Day")!;
    expect(vets.date).toBe("2026-11-11");
    expect(vets.actual).toBeUndefined();
  });

  test("⚠️ New Year's Day can be observed in the PREVIOUS December", () => {
    // Jan 1 2028 is a Saturday, so the office shuts on Friday 31 Dec 2027.
    // Building only the years a range names would miss this entirely.
    expect(dates(2028)["New Year's Day"]).toBe("2027-12-31");
    expect(isUsHoliday("2027-12-31")).toBe(true);
    expect(usHolidayName("2027-12-31")).toBe("New Year's Day");

    // And it is found when asking about 2027, not just 2028.
    const inDec = usHolidaysInRange("2027-12-01", "2027-12-31");
    expect(inDec.map((h) => h.date)).toContain("2027-12-31");
  });
});

test.describe("lookups", () => {
  test("a range returns what is inside it, in order", () => {
    const q4 = usHolidaysInRange("2026-10-01", "2026-12-31");
    expect(q4.map((h) => h.date)).toEqual([
      "2026-10-12",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
  });

  test("an empty or backwards range returns nothing", () => {
    expect(usHolidaysInRange("2026-12-31", "2026-01-01")).toEqual([]);
    expect(usHolidaysInRange("", "")).toEqual([]);
  });

  test("an ordinary working day is not a holiday", () => {
    expect(isUsHoliday("2026-10-13")).toBe(false);
    expect(usHolidayName("2026-10-13")).toBeNull();
    // The day Independence Day actually falls on in 2026 is NOT the day off.
    expect(isUsHoliday("2026-07-04")).toBe(false);
    expect(isUsHoliday("2026-07-03")).toBe(true);
  });
});

test.describe("worked holidays (Settings → Holidays)", () => {
  // Module state: always restore the default so other tests see every holiday.
  test.afterEach(() => setWorkingHolidays([]));

  test("a holiday marked as worked stops being a day off everywhere", () => {
    expect(isUsHoliday("2026-10-12")).toBe(true); // Columbus Day 2026
    setWorkingHolidays(["Columbus Day"]);
    expect(isUsHoliday("2026-10-12")).toBe(false);
    expect(usHolidayName("2026-10-12")).toBeNull();
    expect(usHolidaysForYear(2026).map((h) => h.name)).not.toContain("Columbus Day");
    expect(usHolidaysInRange("2026-10-01", "2026-10-31")).toEqual([]);
    // Other holidays are untouched.
    expect(isUsHoliday("2026-11-11")).toBe(true);
    // The settings card still lists it, so it can be switched back.
    expect(federalHolidaysForYear(2026).map((h) => h.name)).toContain("Columbus Day");
  });

  test("switching it back restores it", () => {
    setWorkingHolidays(["Columbus Day"]);
    setWorkingHolidays([]);
    expect(isUsHoliday("2026-10-12")).toBe(true);
  });
});
