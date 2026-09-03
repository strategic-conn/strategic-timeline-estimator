import { expect, test } from "@playwright/test";

import { categorizeActivity } from "../lib/activity/categorize";
import {
  activityDisplayBody,
  resolveActorId,
} from "../lib/utils/activity-feed";

/**
 * Activity categories are derived from the log text, so the entity NAME must
 * not vote. It used to: a task called "Project kickoff" was filed under
 * Projects, "Sprint planning" under Sprints, and a sprint called "Comment
 * triage" under Comments. Pure — no browser, no network.
 *
 * Every summary this app writes puts the category word in the verb phrase, so
 * the fix is simply to ignore quoted spans.
 */

test.describe("the entity name does not decide the category", () => {
  test("a task named after another entity is still a task", () => {
    expect(categorizeActivity('Dan created task "Project kickoff"')).toBe("task");
    expect(categorizeActivity('Dan created task "Sprint planning"')).toBe("task");
    expect(categorizeActivity('Dan updated task "Comment on the brief"')).toBe("task");
    expect(categorizeActivity('Dan deleted task "Time tracking audit"')).toBe("task");
  });

  test("a sprint named after another entity is still a sprint", () => {
    expect(categorizeActivity('Dan created sprint "Comment triage"')).toBe("sprint");
    expect(categorizeActivity('Dan created sprint "Project cleanup"')).toBe("sprint");
  });

  test("a project named after another entity is still a project", () => {
    expect(categorizeActivity('Dan created project "Sprint Retro Tooling"')).toBe("project");
    expect(categorizeActivity('Dan marked project "Task Force" as Active')).toBe("project");
  });
});

test.describe("the verb phrase still classifies", () => {
  // The real templates, from the stores that write them.
  const cases: [string, string][] = [
    ['Dan created project "Client Portal"', "project"],
    ['Dan updated project "Client Portal"', "project"],
    ['Dan deleted project "Client Portal"', "project"],
    ['Dan marked project "Client Portal" as Archived', "project"],
    ['Dan created sprint "Discovery & Strategy"', "sprint"],
    ['Dan deleted sprint "Discovery & Strategy"', "sprint"],
    ['Dan created task "Fix login"', "task"],
    ['Dan moved "Fix login" to In Progress', "task"],
    ['Dan logged time on "Fix login"', "time"],
    ['Dan commented on "Fix login"', "comment"],
    ['Dan replied to a comment on "Fix login"', "comment"],
    ['Dan reacted to a comment on "Fix login"', "reaction"],
    ['Dan assigned "Fix login" to Ana', "assignment"],
  ];
  for (const [text, want] of cases) {
    test(`${want.padEnd(10)} ← ${text}`, () => {
      expect(categorizeActivity(text)).toBe(want);
    });
  }
});

test("anything unrecognised falls through to other, not a wrong bucket", () => {
  expect(categorizeActivity("Dan did something entirely new")).toBe("other");
  // A real one: the Zoho won-stage sync names no entity type.
  expect(
    categorizeActivity('Dan synced "Acme rebuild" from Zoho — the deal is won'),
  ).toBe("other");
});

/**
 * Actor attribution for rows written before `actor_id` existed, which are
 * matched by the name the text starts with.
 */
test.describe("actor attribution when only the name is stored", () => {
  // The real member list of this workspace, in its real order — "Daniel" comes
  // before "Daniel Arvi Paragas", which is what made the first-match version
  // wrong.
  const members = [
    "danielparagas5",
    "Enyeng Paragas",
    "Daniel",
    "Martin",
    "Daniel Arvi Paragas",
    "E2E Test Bot",
  ].map((name, i) => ({ id: `id${i}`, name }));
  const byName = (n: string) => members.find((m) => m.name === n)!.id;

  test("the longer name wins over its own prefix", () => {
    expect(
      resolveActorId(
        { text: 'Daniel Arvi Paragas deleted project "Test Estimate"' },
        members,
      ),
    ).toBe(byName("Daniel Arvi Paragas"));
  });

  test("the shorter name still resolves to itself", () => {
    expect(resolveActorId({ text: 'Daniel created task "Fix login"' }, members)).toBe(
      byName("Daniel"),
    );
  });

  test("and the body keeps the whole name off the front", () => {
    const text = 'Daniel Arvi Paragas deleted project "Test Estimate"';
    const id = resolveActorId({ text }, members);
    const name = members.find((m) => m.id === id)!.name;
    expect(activityDisplayBody(text, name, null)).toBe(
      'deleted project "Test Estimate"',
    );
  });

  test("a stored actor_id always wins over any name matching", () => {
    expect(
      resolveActorId(
        { actor_id: "explicit", text: "Daniel Arvi Paragas did a thing" },
        members,
      ),
    ).toBe("explicit");
  });
});

/**
 * `withProjectScope` appends " · Project Name" — unquoted, so it voted on the
 * category even after quoted entity names were excluded. Found by reading the
 * activity rows a real comment produced.
 */
test.describe("the project scope suffix does not decide the category", () => {
  test("a task in a project named after another entity is still a task", () => {
    expect(categorizeActivity('Dan created task "Fix login" · Comment Co')).toBe("task");
    expect(categorizeActivity('Dan created task "Fix login" · Sprint Ventures')).toBe("task");
    expect(categorizeActivity('Dan created task "Fix login" · Project Runway')).toBe("task");
  });

  test("the real templates still classify with a scope attached", () => {
    expect(categorizeActivity('Dan commented on "Fix login" · Acme')).toBe("comment");
    expect(categorizeActivity('Dan replied on "Fix login" · Acme')).toBe("comment");
    expect(categorizeActivity('Dan logged time on "Fix login" · Acme')).toBe("time");
    expect(categorizeActivity('Dan moved "Fix login" to In Progress · Acme')).toBe("task");
  });

  test("typographic quotes are handled too", () => {
    // Comment/task activity uses curly quotes; project activity uses straight.
    expect(categorizeActivity("Dan created task \u201cSprint review\u201d \u00b7 Acme")).toBe("task");
    expect(categorizeActivity("Dan commented on \u201cFix login\u201d \u00b7 Acme")).toBe("comment");
  });
});
