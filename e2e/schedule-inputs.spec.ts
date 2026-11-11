import { expect, test } from "@playwright/test";

import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { estimateDateRange, resultFromQuote } from "../lib/discovery/from-line-items";
import { scheduleInputsOf } from "../lib/discovery/schedule-inputs";
import type { ClientQuote } from "../types/proposal.types";

/**
 * Start date, hard deadline, client review time and blackout periods moved
 * from questionnaire section 7 to the Adjust tab (2026-11-12) and live on
 * `schedule_plan`. Pure: no browser, no live data.
 */
const QUOTE = (over: Partial<ClientQuote> = {}): ClientQuote =>
  ({
    id: "q1",
    title: "Q",
    project_id: null,
    platform: "wordpress",
    status: "draft",
    requirements_unclear: false,
    line_items: [{ id: "l1", title: "Work", base_hours: 40, tier: "basic", quantity: 1, hours: 40, depends_on: [] }],
    addons: {},
    discovery: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as ClientQuote;

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

test("a line-items-only estimate starts on its own start date", () => {
  // Before the move it had no questionnaire, so it could only start "today".
  const q = QUOTE({ schedule_plan: { strategy: "quick", start_date: "2027-03-01" } });
  expect(estimateDateRange(q)?.start).toBe("2027-03-01");
});

test("the Adjust tab's value wins over the old questionnaire answer, and falls back to it", () => {
  const discovery = {
    ...createEmptyDiscoveryProject(),
    project_start_date: "2027-01-04",
    hard_launch_date: "2027-06-01",
    client_review_turnaround: 5,
    has_blackout_periods: true,
    blackout_notes: "Holiday shutdown",
  } as never;
  // Nothing set on the estimate yet: an existing guided estimate keeps its answers.
  expect(scheduleInputsOf(QUOTE({ discovery }))).toEqual({
    startDate: "2027-01-04",
    hardDeadline: "2027-06-01",
    reviewDays: 5,
    blackout: true,
    blackoutNotes: "Holiday shutdown",
  });
  // Set on the estimate: that is the answer — including clearing a date ("" = today / none).
  const own = QUOTE({
    discovery,
    schedule_plan: { strategy: "quick", start_date: "", hard_deadline: "2027-07-01", review_days: 2, blackout: false },
  });
  expect(scheduleInputsOf(own)).toMatchObject({ startDate: "", hardDeadline: "2027-07-01", reviewDays: 2, blackout: false });
});

test("blackout periods push a line-items-only estimate's launch out", () => {
  const base = { strategy: "quick" as const, start_date: "2027-03-01" };
  const off = resultFromQuote(QUOTE({ schedule_plan: { ...base, blackout: false } }));
  const on = resultFromQuote(QUOTE({ schedule_plan: { ...base, blackout: true } }));
  expect(on.timeline.totalBusinessDays).toBeGreaterThan(off.timeline.totalBusinessDays);
});

test("with nothing set anywhere: starts today, no deadline, 3-day reviews, no blackouts", () => {
  expect(scheduleInputsOf(QUOTE())).toEqual({
    startDate: "",
    hardDeadline: "",
    reviewDays: 3,
    blackout: false,
    blackoutNotes: "",
  });
});
