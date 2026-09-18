import { expect, test } from "@playwright/test";

import { computeTimeline } from "../lib/discovery/timeline";
import {
  addWorkingDays,
  bufferSprintDates,
  riskAdjustedFinish,
  workingDaysBetween,
} from "../lib/discovery/team-calendar";
import { clampRiskBuffer } from "../components/features/proposals/RiskBufferCard";
import type { DiscoveryProject, Estimate } from "../types/discovery.types";

/**
 * Schedule contingency. Pure — no browser, no store.
 *
 * Anchored in March 2027, which carries no federal holiday, so these measure the
 * buffer and nothing else.
 */
const estimate = (hours: number): Estimate =>
  ({
    phases: [
      { id: "discovery", label: "Discovery", min: hours, mid: hours, max: hours },
      { id: "development", label: "Development", min: hours, mid: hours, max: hours },
    ],
    totalMin: hours * 2,
    totalMid: hours * 2,
    totalMax: hours * 2,
    assumptions: [],
  }) as unknown as Estimate;

const project = (): DiscoveryProject =>
  ({ project_start_date: "2027-03-01", client_review_turnaround: 0 }) as DiscoveryProject;

test.describe("the buffer stretches time, never money", () => {
  test("⚠️ hours are IDENTICAL with and without a buffer", () => {
    // The whole reason this is a separate control from `requirements_unclear`.
    // If a risk percentage ever reached the hours it would silently inflate
    // what the client is quoted.
    const none = computeTimeline(project(), estimate(80), null, 0);
    const buffered = computeTimeline(project(), estimate(80), null, 25);
    expect(buffered.baseBusinessDays).toBe(none.totalBusinessDays);
    expect(buffered.totalBusinessDays).toBeGreaterThan(none.totalBusinessDays);
    expect(buffered.riskBufferPct).toBe(25);
  });

  test("the span scales by the percentage", () => {
    const none = computeTimeline(project(), estimate(80), null, 0);
    const buffered = computeTimeline(project(), estimate(80), null, 50);
    expect(buffered.totalBusinessDays).toBe(Math.round(none.totalBusinessDays * 1.5));
  });

  test("0% changes nothing at all", () => {
    const none = computeTimeline(project(), estimate(80), null, 0);
    expect(none.riskBufferPct).toBe(0);
    expect(none.totalBusinessDays).toBe(none.baseBusinessDays);
  });

  test("the plan stays continuous — starts scale too, and 0 stays 0", () => {
    // Buffering only the END offsets would leave each phase finishing later
    // while the next still began on its original day.
    const buffered = computeTimeline(project(), estimate(80), null, 40);
    const first = buffered.phases.find((p) => p.id === "discovery")!;
    expect(first.startOffset, "the project still starts when it starts").toBe(0);
    const dev = buffered.phases.find((p) => p.id === "development")!;
    const plain = computeTimeline(project(), estimate(80), null, 0);
    const plainDev = plain.phases.find((p) => p.id === "development")!;
    expect(dev.startOffset).toBeGreaterThan(plainDev.startOffset);
  });

  test("a buffer above 100 or below 0 is clamped, not obeyed", () => {
    expect(computeTimeline(project(), estimate(80), null, 900).riskBufferPct).toBe(100);
    expect(computeTimeline(project(), estimate(80), null, -50).riskBufferPct).toBe(0);
    expect(clampRiskBuffer(900)).toBe(100);
    expect(clampRiskBuffer(-5)).toBe(0);
    expect(clampRiskBuffer(12.6)).toBe(13);
    expect(clampRiskBuffer(Number.NaN)).toBe(0);
  });
});

test.describe("working days between two dates", () => {
  test("round-trips with addWorkingDays", () => {
    // The property the finish-date maths leans on.
    const start = "2027-03-01";
    for (const end of ["2027-03-05", "2027-03-12", "2027-04-02"]) {
      const n = workingDaysBetween(start, end);
      expect(
        addWorkingDays(new Date(`${start}T12:00:00`), n).toISOString().slice(0, 10),
        `${start} → ${end}`,
      ).toBe(end);
    }
  });

  test("weekends do not count, and a backwards range is zero", () => {
    expect(workingDaysBetween("2027-03-01", "2027-03-08")).toBe(5);
    expect(workingDaysBetween("2027-03-08", "2027-03-01")).toBe(0);
    expect(workingDaysBetween("2027-03-01", "2027-03-01")).toBe(0);
  });

  test("a holiday does not count either", () => {
    // Thanksgiving 2026 is Thu Nov 26. Mon 23rd → Mon 30th is 5 weekdays, but
    // only 4 of them are working days.
    expect(workingDaysBetween("2026-11-23", "2026-11-30")).toBe(4);
  });
});

test.describe("risk-adjusted finish", () => {
  test("extends by the percentage and lands on a working day", () => {
    // Mon 1 Mar → Mon 29 Mar is 20 working days; +20% = 24 → Fri 2 Apr.
    expect(workingDaysBetween("2027-03-01", "2027-03-29")).toBe(20);
    expect(riskAdjustedFinish("2027-03-01", "2027-03-29", 20)).toBe("2027-04-02");
  });

  test("0% returns the end date untouched", () => {
    expect(riskAdjustedFinish("2027-03-01", "2027-03-29", 0)).toBe("2027-03-29");
  });

  test("nothing to stretch returns null", () => {
    expect(riskAdjustedFinish("2027-03-01", "2027-03-01", 20)).toBeNull();
    expect(riskAdjustedFinish("2027-03-29", "2027-03-01", 20)).toBeNull();
  });
});

test.describe("applying it to sprints", () => {
  const sprints = [
    { id: "a", name: "Design", start_date: "2027-03-01", end_date: "2027-03-12" },
    { id: "b", name: "Development", start_date: "2027-03-15", end_date: "2027-04-09" },
  ];

  test("every sprint is re-anchored, so the plan stays continuous", () => {
    const moves = bufferSprintDates(sprints, 20);
    expect(moves.map((m) => m.id)).toEqual(["a", "b"]);

    // The second sprint's START moves too — not just its end.
    const dev = moves.find((m) => m.id === "b")!;
    expect(dev.to.start > dev.from.start, "start must slide as well").toBe(true);
    expect(dev.to.end > dev.from.end).toBe(true);

    // And it still begins after the first one finishes.
    const design = moves.find((m) => m.id === "a")!;
    expect(dev.to.start > design.to.end).toBe(true);
  });

  test("0% moves nothing, and reports nothing", () => {
    expect(bufferSprintDates(sprints, 0)).toEqual([]);
    expect(bufferSprintDates([], 20)).toEqual([]);
  });

  test("only the sprints that actually move are returned", () => {
    // The earliest sprint is the anchor, so its start never shifts. With a tiny
    // buffer on a short sprint the rounding can leave it exactly where it was —
    // and an unchanged row must not appear in a list of changes.
    const moves = bufferSprintDates(
      [{ id: "a", name: "Solo", start_date: "2027-03-01", end_date: "2027-03-02" }],
      10,
    );
    for (const m of moves) {
      expect(m.to.start !== m.from.start || m.to.end !== m.from.end).toBe(true);
    }
  });
});
