import { expect, test } from "@playwright/test";

import {
  burndown,
  projectVelocity,
  sprintVelocity,
  workdaysIn,
} from "../lib/sprints/velocity";
import type { SprintStatus } from "../types/sprint.types";

/**
 * Sprint velocity, forecast and burndown — pure, no browser.
 * Hours are ESTIMATED hours; "finished" is completed_at, by calendar day.
 */
const NOW = new Date("2026-10-14T10:00:00"); // a Wednesday

const sprint = (id: string, start: string, end: string, status: SprintStatus = "completed") =>
  ({ id, name: id, project_id: "p", status, start_date: start, end_date: end });

const task = (over: {
  sprint_id: string | null;
  estimated_hours?: number;
  status?: "todo" | "done";
  completed_at?: string | null;
  project_id?: string;
}) => ({
  project_id: "p",
  status: "todo" as "todo" | "done",
  estimated_hours: 8,
  completed_at: null as string | null,
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

test.describe("sprint velocity", () => {
  test("only work finished by the sprint's last day counts", () => {
    const s = sprint("s1", "2026-09-07", "2026-09-18");
    const v = sprintVelocity(
      s,
      [
        task({ sprint_id: "s1", status: "done", completed_at: "2026-09-18T22:00:00" }), // last day, late evening
        task({ sprint_id: "s1", status: "done", completed_at: "2026-09-21T09:00:00" }), // after it ended
        task({ sprint_id: "s1" }), // not done
        task({ sprint_id: "other", status: "done", completed_at: "2026-09-10T09:00:00" }),
      ],
      NOW,
    );
    expect(v.committed).toBe(24);
    expect(v.completed).toBe(8);
    expect(v.ended).toBe(true);
  });

  test("a done task with no estimate is flagged, not silently ignored", () => {
    const v = sprintVelocity(
      sprint("s1", "2026-09-07", "2026-09-18"),
      [task({ sprint_id: "s1", status: "done", estimated_hours: 0, completed_at: "2026-09-10T09:00:00" })],
      NOW,
    );
    expect(v.completed).toBe(0);
    expect(v.unestimatedDone).toBe(1);
  });
});

test.describe("project velocity + forecast", () => {
  const sprints = [
    sprint("a", "2026-08-03", "2026-08-14"),
    sprint("b", "2026-08-17", "2026-08-28"),
    sprint("c", "2026-08-31", "2026-09-11"),
    sprint("d", "2026-09-14", "2026-09-25"),
    sprint("x", "2026-09-28", "2026-10-09", "cancelled"),
    sprint("e", "2026-10-12", "2026-10-23", "active"), // running now
  ];
  const doneIn = (sprint_id: string, h: number, day: string) =>
    task({ sprint_id, estimated_hours: h, status: "done", completed_at: `${day}T12:00:00` });
  const tasks = [
    doneIn("a", 100, "2026-08-10"), // oldest — outside the 3-sprint window
    doneIn("b", 30, "2026-08-20"),
    doneIn("c", 40, "2026-09-02"),
    doneIn("d", 50, "2026-09-20"),
    doneIn("e", 10, "2026-10-13"), // current sprint — not in the average
    task({ sprint_id: "e", estimated_hours: 60 }),
    task({ sprint_id: null, estimated_hours: 60 }), // backlog still counts as remaining
    task({ sprint_id: null, estimated_hours: 500, project_id: "other" }),
  ];

  test("averages the last three ENDED sprints, skipping cancelled and running ones", () => {
    const v = projectVelocity("p", sprints, tasks, NOW);
    expect(v.basis.map((r) => r.sprint.id)).toEqual(["b", "c", "d"]);
    expect(v.average).toBe(40);
    expect(v.rows.map((r) => r.sprint.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("forecast = remaining ÷ velocity, in sprints of the measured length", () => {
    const v = projectVelocity("p", sprints, tasks, NOW);
    expect(v.remaining).toBe(120); // 60 in the sprint + 60 in the backlog, other project excluded
    expect(v.forecast?.sprints).toBe(3);
    // 3 sprints × 10 working days (b 10, c 9 — Labor Day — d 10 → 10) from
    // Wed 14 Oct, skipping Veterans Day (11 Nov) and Thanksgiving (26 Nov).
    expect(v.forecast?.finish).toBe("2026-11-27");
  });

  test("no ended sprint yet → no velocity and no forecast, not a zero", () => {
    const v = projectVelocity("p", [sprint("e", "2026-10-12", "2026-10-23", "active")], tasks, NOW);
    expect(v.average).toBeNull();
    expect(v.forecast).toBeNull();
  });

  test("nothing left → no forecast", () => {
    const v = projectVelocity("p", sprints.slice(0, 4), tasks.slice(0, 4), NOW);
    expect(v.remaining).toBe(0);
    expect(v.forecast).toBeNull();
  });
});

test.describe("burndown", () => {
  test("working days only, ideal to zero, nothing drawn for days still to come", () => {
    // Starts on Columbus Day (Mon 12 Oct), so the first sprint day is the 13th.
    const s = sprint("e", "2026-10-12", "2026-10-23", "active");
    const pts = burndown(
      s,
      [
        task({ sprint_id: "e", estimated_hours: 20, status: "done", completed_at: "2026-10-13T15:00:00" }),
        task({ sprint_id: "e", estimated_hours: 30 }),
      ],
      NOW,
    );
    expect(pts).toHaveLength(9);
    // Remaining is END of day: the 20 h finished on the 13th is already off.
    expect(pts[0]).toEqual({ day: "2026-10-13", ideal: 50, remaining: 30 });
    expect(pts[1]).toEqual({ day: "2026-10-14", ideal: 43.8, remaining: 30 }); // today
    expect(pts[2].remaining).toBeNull(); // tomorrow
    expect(pts[8]).toEqual({ day: "2026-10-23", ideal: 0, remaining: null });
  });

  test("weekends and holidays are not sprint days", () => {
    // Fri 9 Oct → Tue 13 Oct 2026 spans a weekend AND Columbus Day (Mon 12 Oct).
    expect(workdaysIn("2026-10-09", "2026-10-13")).toEqual(["2026-10-09", "2026-10-13"]);
  });
});
