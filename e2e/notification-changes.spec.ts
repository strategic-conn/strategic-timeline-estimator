import { expect, test } from "@playwright/test";

import { describeTaskChange } from "../lib/activity/task-change";
import { groupBatch } from "../lib/activity/workspace-push";

/**
 * The notices (bell + email) for changes to someone's work (2026-11-12): what
 * a task change says, and how a bulk change becomes one notice per person.
 * Pure — no browser, no live data.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

const T = (o: { due_date?: string | null; estimated_hours?: number; sprint_id?: string | null }) => ({
  due_date: o.due_date ?? undefined,
  estimated_hours: o.estimated_hours,
  sprint_id: o.sprint_id ?? null,
});

test("a task change names what moved — and nothing when nothing on the schedule did", () => {
  expect(describeTaskChange(T({ due_date: "2026-12-01" }), T({ due_date: "2026-12-05" }))).toBe("due Dec 1 → Dec 5");
  expect(describeTaskChange(T({ estimated_hours: 8 }), T({ estimated_hours: 12 }))).toBe("8 h → 12 h");
  expect(
    describeTaskChange(
      T({ due_date: "2026-12-01", estimated_hours: 8, sprint_id: "a" }),
      T({ due_date: "2026-12-05", estimated_hours: 12, sprint_id: "b" }),
    ),
  ).toBe("due Dec 1 → Dec 5 · 8 h → 12 h · moved to another sprint");
  expect(describeTaskChange(T({ sprint_id: "a" }), T({ sprint_id: null }))).toBe("moved to the backlog");
  expect(describeTaskChange(T({}), T({ due_date: "2026-12-05" }))).toBe("due no date → Dec 5");
  // A DATE column is a local day: Dec 1 never prints as Nov 30, in any zone.
  expect(describeTaskChange(T({ due_date: "2026-12-01" }), T({ due_date: "2026-12-02" }))).toMatch(/^due Dec 1 /);
  // Same schedule (a rename, a status move): no notice.
  expect(describeTaskChange(T({ due_date: "2026-12-01", estimated_hours: 8 }), T({ due_date: "2026-12-01", estimated_hours: 8 }))).toBeNull();
});

test("a bulk change becomes one notice per person, emailed if any part was", () => {
  const n = (ids: string[], text: string, email = true) => ({ recipientIds: ids, text, email });
  const g = groupBatch([
    n(["ana", "ben"], "changed A"),
    n(["ana"], "changed B"),
    n(["ana", "cy"], "deleted C", false),
    n(["ben", "ben"], "changed D"), // a duplicate id counts once
  ]);
  expect(g.get("ana")).toMatchObject({ count: 3, email: true });
  expect(g.get("ben")).toMatchObject({ count: 2, email: true });
  // One change: their own notice, in its own words.
  expect(g.get("cy")).toMatchObject({ count: 1, email: false, first: { text: "deleted C" } });
});
