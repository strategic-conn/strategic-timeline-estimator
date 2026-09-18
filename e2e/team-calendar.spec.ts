import { expect, test } from "@playwright/test";
import { addBusinessDays, format } from "date-fns";

import {
  addWorkingDays,
  buildTeamCalendar,
  timelineShift,
  type CalendarMember,
} from "../lib/discovery/team-calendar";

/**
 * Booked time off folded into the tentative timeline. Pure — no browser.
 *
 * ⚠️ The PTO cases below are anchored in **March 2027**, which has no federal
 * holiday (the gap between Presidents' Day and Memorial Day). They used to sit
 * in October 2026 and each drifted by a day once holidays landed, because
 * Columbus Day is Mon 2026-10-12 — correct behaviour, but it made a test about
 * half-staffing quietly depend on a holiday. Holiday interaction is covered on
 * its own in the "US holidays" block instead.
 */
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const D = (s: string) => new Date(`${s}T12:00:00`);

const team = (n: number): CalendarMember[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    deactivated_at: null,
    confirmed_at: "2026-01-01T00:00:00Z",
  }));

const off = (
  id: string,
  start: string,
  end: string,
  kind: "pto" | "partial" | "unavailable" = "pto",
  status: "pending" | "approved" | "rejected" = "approved",
) => ({ user_id: id, start_date: start, end_date: end, kind, status });

test.describe("a workspace with no time off is untouched", () => {
  test("over a HOLIDAY-FREE window, no calendar means addBusinessDays exactly", () => {
    // Feb–Mar 2027 has no federal holiday after Presidents' Day (Feb 15), so
    // this isolates the walk itself.
    //
    // ⚠️ This used to run over October and pass by DELEGATION — `addWorkingDays`
    // short-circuited to `addBusinessDays` when there was no calendar, so the
    // walk was never actually compared. Holidays now apply with or without a
    // roster (an empty team still does not work on Christmas), the shortcut is
    // gone, and this genuinely exercises the loop — weekend starts included.
    for (let offset = 0; offset <= 30; offset++) {
      for (const start of ["2027-02-16", "2027-02-19", "2027-02-20", "2027-02-21"]) {
        expect(
          ymd(addWorkingDays(D(start), offset, null)),
          `${start} +${offset}`,
        ).toBe(ymd(addBusinessDays(D(start), offset)));
      }
    }
  });

  test("an empty roster yields no calendar at all", () => {
    // The team store hydrates async; stretching a timeline to infinity (or
    // collapsing it) while it loads would be worse than ignoring leave.
    expect(buildTeamCalendar([], [off("m0", "2026-10-05", "2026-10-09")])).toBeNull();
    expect(
      buildTeamCalendar(
        [{ id: "m0", deactivated_at: "2026-01-01T00:00:00Z", confirmed_at: "x" }],
        [],
      ),
    ).toBeNull();
  });

  test("a roster with nobody away produces an empty calendar, and adds no PTO", () => {
    const cal = buildTeamCalendar(team(4), []);
    expect(cal?.factor.size).toBe(0);
    expect(ymd(addWorkingDays(D("2027-02-16"), 10, cal))).toBe(
      ymd(addBusinessDays(D("2027-02-16"), 10)),
    );
    expect(timelineShift(D("2027-02-16"), 10, cal).fromPto).toBe(false);
  });
});

test.describe("US holidays", () => {
  test("a holiday is stepped over even with NO calendar at all", () => {
    // Not conditional on knowing the roster: an empty workspace still does not
    // work on Christmas. Fri 2026-12-25 is the observed day.
    const plain = addBusinessDays(D("2026-12-21"), 5); // Mon + 5 → Mon 28th
    const real = addWorkingDays(D("2026-12-21"), 5, null);
    expect(ymd(plain)).toBe("2026-12-28");
    expect(ymd(real)).toBe("2026-12-29");
  });

  test("the OBSERVED day is the one skipped, not the actual date", () => {
    // July 4 2026 is a Saturday; the office shuts Friday the 3rd.
    const out = addWorkingDays(D("2026-06-29"), 5, null); // Mon + 5
    expect(ymd(addBusinessDays(D("2026-06-29"), 5))).toBe("2026-07-06");
    expect(ymd(out)).toBe("2026-07-07");
  });

  test("timelineShift names the holidays and separates them from leave", () => {
    const withPto = buildTeamCalendar(team(2), [
      off("m0", "2026-12-28", "2026-12-31"),
    ])!;
    const s = timelineShift(D("2026-12-21"), 8, withPto);
    expect(s.days).toBeGreaterThan(0);
    expect(s.holidays.map((h) => h.name)).toContain("Christmas Day");
    expect(s.fromPto, "half the team away must register separately").toBe(true);

    // Holidays alone must NOT claim time off contributed.
    const holidaysOnly = timelineShift(D("2026-12-21"), 5, null);
    expect(holidaysOnly.holidays.map((h) => h.name)).toEqual(["Christmas Day"]);
    expect(holidaysOnly.fromPto).toBe(false);
  });

  test("a span with neither reports nothing to explain", () => {
    const s = timelineShift(D("2027-02-16"), 5, null);
    expect(s).toEqual({ days: 0, holidays: [], fromPto: false });
  });
});

test.describe("what the calendar records", () => {
  test("one of four away leaves that day at 75%", () => {
    const cal = buildTeamCalendar(team(4), [off("m0", "2026-10-07", "2026-10-07")])!;
    expect(cal.headcount).toBe(4);
    expect(cal.factor.get("2026-10-07")).toBe(0.75);
    expect(cal.factor.has("2026-10-06")).toBe(false);
  });

  test("the whole team away is a zero day", () => {
    const entries = team(3).map((m) => off(m.id, "2026-10-07", "2026-10-07"));
    const cal = buildTeamCalendar(team(3), entries)!;
    expect(cal.factor.get("2026-10-07")).toBe(0);
  });

  test("a partial day is half a person", () => {
    const cal = buildTeamCalendar(team(2), [
      off("m0", "2026-10-07", "2026-10-07", "partial"),
    ])!;
    expect(cal.factor.get("2026-10-07")).toBe(0.75);
  });

  test("overlapping entries for the SAME person do not double-subtract", () => {
    // A partial day sitting inside a full PTO block is still one person away.
    const cal = buildTeamCalendar(team(2), [
      off("m0", "2026-10-05", "2026-10-09"),
      off("m0", "2026-10-07", "2026-10-07", "partial"),
    ])!;
    expect(cal.factor.get("2026-10-07")).toBe(0.5);
  });

  test("only APPROVED leave counts", () => {
    const pending = buildTeamCalendar(team(2), [
      off("m0", "2026-10-07", "2026-10-07", "pto", "pending"),
    ])!;
    expect(pending.factor.size).toBe(0);

    const rejected = buildTeamCalendar(team(2), [
      off("m0", "2026-10-07", "2026-10-07", "pto", "rejected"),
    ])!;
    expect(rejected.factor.size).toBe(0);
  });

  test("an invitee who never accepted is not roster capacity", () => {
    // `confirmed_at` is OPTIONAL, so an unaccepted invite carries `undefined`,
    // not null — a `!== null` check would have counted them as a working body
    // and quietly shrunk everyone else's share of each absence.
    const invitee = { id: "invited", deactivated_at: null };
    const cal = buildTeamCalendar(
      [...team(1), invitee],
      [off("m0", "2026-10-07", "2026-10-07")],
    )!;
    expect(cal.headcount).toBe(1);
    expect(cal.factor.get("2026-10-07")).toBe(0);
  });

  test("leave belonging to somebody not on the roster is ignored", () => {
    const cal = buildTeamCalendar(team(2), [off("stranger", "2026-10-07", "2026-10-07")])!;
    expect(cal.factor.size).toBe(0);
  });
});

test.describe("how it moves the timeline", () => {
  test("a full-team shutdown is stepped over", () => {
    // Everyone off Mon 1st – Fri 5th March: five business days of work starting
    // the Friday before cannot land before the following week.
    const entries = team(3).map((m) => off(m.id, "2027-03-01", "2027-03-05"));
    const cal = buildTeamCalendar(team(3), entries)!;
    expect(ymd(addBusinessDays(D("2027-02-26"), 5))).toBe("2027-03-05");
    expect(ymd(addWorkingDays(D("2027-02-26"), 5, cal))).toBe("2027-03-12");
    expect(timelineShift(D("2027-02-26"), 5, cal).days).toBe(7);
  });

  test("a half-staffed week stretches the work, it does not skip it", () => {
    const cal = buildTeamCalendar(team(2), [off("m0", "2027-03-01", "2027-03-05")])!;
    // Mon 1st – Fri 5th are half-staffed: five weekdays yielding 2.5 days of
    // credit. The remaining 2.5 come at full rate from Mon 8th, landing on
    // Wed 10th — five calendar days later than the unadjusted Fri 5th.
    expect(ymd(addBusinessDays(D("2027-02-26"), 5))).toBe("2027-03-05");
    expect(ymd(addWorkingDays(D("2027-02-26"), 5, cal))).toBe("2027-03-10");
    expect(timelineShift(D("2027-02-26"), 5, cal).days).toBe(5);
  });

  test("leave AFTER the work is finished changes nothing", () => {
    const cal = buildTeamCalendar(team(2), [off("m0", "2027-06-01", "2027-06-05")])!;
    expect(ymd(addWorkingDays(D("2027-03-01"), 5, cal))).toBe(
      ymd(addBusinessDays(D("2027-03-01"), 5)),
    );
    expect(timelineShift(D("2027-03-01"), 5, cal).days).toBe(0);
  });

  test("offset 0 is the start date, calendar or not", () => {
    const cal = buildTeamCalendar(team(2), [off("m0", "2027-03-01", "2027-03-05")])!;
    expect(ymd(addWorkingDays(D("2027-03-01"), 0, cal))).toBe(
      ymd(addBusinessDays(D("2027-03-01"), 0)),
    );
  });

  test("a permanently-absent team terminates instead of looping forever", () => {
    const entries = team(2).map((m) => off(m.id, "2026-01-01", "2030-01-01"));
    const cal = buildTeamCalendar(team(2), entries)!;
    const out = addWorkingDays(D("2026-10-05"), 5, cal);
    // Bounded by MAX_WALK_DAYS rather than hanging the estimator.
    expect(out.getTime()).toBeGreaterThan(D("2026-10-05").getTime());
    expect(Number.isNaN(out.getTime())).toBe(false);
  });
});
