import { expect, test } from "@playwright/test";

import { linesFromDraft } from "../lib/esther/estimate/build";
import {
  actualsFrom,
  allowedAdjustment,
  anonymize,
  historyFor,
  pickSimilar,
  type HistoryQuote,
  type HistoryTask,
} from "../lib/esther/estimate/history";
import type { DraftResult } from "../lib/esther/estimate/types";
import { catalogForPlatform } from "../lib/proposal-catalog";
import type { ProposalLineItem } from "../types/proposal.types";

/**
 * Esther's reference = this workspace's approved estimates + finished-task
 * hours (decided 2026-11-21). Pure: client names must never reach the prompt,
 * the closest past work is picked, and only real finished work may resize a
 * catalog task — within bounds.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

const ROW = catalogForPlatform("wordpress").find((r) => r.base_hours >= 4)!;

const line = (over: Partial<ProposalLineItem>): ProposalLineItem => ({
  id: Math.random().toString(36).slice(2),
  title: "Work",
  module: null,
  category_id: null,
  catalog_id: null,
  base_hours: 4,
  tier: "basic",
  quantity: 1,
  hours: 4,
  depends_on: [],
  ...over,
});

const quote = (over: Partial<HistoryQuote>): HistoryQuote => ({
  id: Math.random().toString(36).slice(2),
  title: "Willow School",
  client_name: "Willow School LLC",
  line_items: [],
  zoho: { account: "Willow School LLC", contact: "Jane Doe", deal_name: "Willow School", imported_at: "" },
  context: null,
  updated_at: "2026-11-01T00:00:00Z",
  ...over,
});

test("client names, contacts, websites, emails and phones never reach the prompt", () => {
  const names = ["Willow School LLC", "Willow School", "Jane Doe"];
  expect(anonymize("Willow School portal for Jane Doe", names)).toBe("[client] portal for [client]");
  expect(anonymize("Audit of https://willow.edu and www.willow.com", names)).toBe("Audit of [website] and [website]");
  expect(anonymize("Mail jane@willow.edu or call +1 (555) 123-4567", names)).toBe("Mail [email] or call [phone]");
  // Whole words only: a name inside another word is left alone.
  expect(anonymize("Willowschoolers club", ["Willow School"])).toBe("Willowschoolers club");

  const q = quote({
    line_items: [
      line({ title: "Willow School parent portal" }),
      line({ title: "Site audit of https://willow.edu (redesign)" }),
      line({ title: "Training for Jane Doe" }),
    ],
  });
  const h = historyFor([q], [], "parent portal", () => null);
  expect(h.prompt).not.toMatch(/willow|jane/i);
  expect(h.prompt).toContain("Past estimate 1"); // numbered, never titled
  expect(h.prompt).toContain("[client] parent portal");
  expect(h.used).toEqual([q.id]);
});

test("the closest past work is picked; with no overlap, the most recent", () => {
  const bakery = quote({ id: "bakery", line_items: [line({ title: "Cake order form" }), line({ title: "Menu page" })], updated_at: "2026-01-01" });
  const law = quote({ id: "law", line_items: [line({ title: "Attorney profiles" })], updated_at: "2026-10-01" });
  const gym = quote({ id: "gym", line_items: [line({ title: "Class schedule" })], updated_at: "2026-09-01" });
  expect(pickSimilar([law, gym, bakery], "an online cake order form and a menu", 1).map((q) => q.id)).toEqual(["bakery"]);
  expect(pickSimilar([gym, bakery, law], "nothing in common", 2).map((q) => q.id)).toEqual(["law", "gym"]);
  expect(historyFor([], [], "x", () => null)).toEqual({ used: [], actuals: {}, prompt: "" });
});

test("finished work: typical actual ÷ estimate per catalog task; unfinished or unlogged work is ignored", () => {
  const a = line({ id: "a", catalog_id: ROW.id });
  const b = line({ id: "b", catalog_id: ROW.id });
  const c = line({ id: "c", catalog_id: ROW.id });
  const custom = line({ id: "d", title: "Willow School booking widget" });
  const q = quote({ line_items: [a, b, c, custom] });
  const tasks: HistoryTask[] = [
    { source_line_item_id: "a", estimated_hours: 4, logged_hours: 6 }, // ×1.5
    { source_line_item_id: "b", estimated_hours: 4, logged_hours: 8 }, // ×2
    { source_line_item_id: "c", estimated_hours: 4, logged_hours: 4.4 }, // ×1.1
    { source_line_item_id: "d", estimated_hours: 10, logged_hours: 15 },
    { source_line_item_id: "a", estimated_hours: 4, logged_hours: null }, // no time logged
    { source_line_item_id: "zzz", estimated_hours: 4, logged_hours: 9 }, // not a line of these estimates
  ];
  const { catalog, custom: customs } = actualsFrom([q], tasks);
  expect(catalog[ROW.id]).toEqual({ samples: 3, ratio: 1.5, estimated: 4, actual: 6 }); // medians
  expect(customs).toEqual([{ title: "[client] booking widget", estimated: 10, actual: 15 }]);

  const h = historyFor([q], tasks, "booking", (id) => (id === ROW.id ? ROW.name : null));
  expect(h.prompt).toContain(`catalog ${ROW.id} "${ROW.name}": estimated 4 h → took 6 h (typically ×1.5, 3 finished tasks)`);
  expect(h.prompt).not.toMatch(/willow/i);
});

test("a catalog task is resized only by finished work, only toward it, never past 0.5×–3×", () => {
  const up = { samples: 3, ratio: 1.5, estimated: 4, actual: 6 };
  expect(allowedAdjustment(4, 6, undefined)).toBe(4); // no history → catalog hours
  expect(allowedAdjustment(4, null, up)).toBe(4); // not asked
  expect(allowedAdjustment(4, 6, up)).toBe(6);
  expect(allowedAdjustment(4, 20, up)).toBe(6); // not beyond what history showed
  expect(allowedAdjustment(4, 2, up)).toBe(4); // not the other way
  expect(allowedAdjustment(4, 50, { ...up, ratio: 9 })).toBe(12); // 3× cap
  expect(allowedAdjustment(4, 0.5, { ...up, ratio: 0.2 })).toBe(2); // 0.5× floor

  const draft: DraftResult = {
    lines: [
      {
        catalog_id: ROW.id,
        title: "",
        base_hours: ROW.base_hours,
        responsible: "IT",
        level: 1,
        tier: "basic",
        quantity: 1,
        adjusted_hours: ROW.base_hours * 1.5,
        requirement_ids: [],
        note: "Usually takes longer here.",
      },
    ],
    assumptions: [],
    open_questions: [],
    requirements_unclear: false,
  };
  const without = linesFromDraft(draft, "wordpress");
  const withHistory = linesFromDraft(draft, "wordpress", { [ROW.id]: { samples: 3, ratio: 1.5, estimated: 4, actual: 6 } });
  expect(without[0].base_hours).toBe(ROW.base_hours);
  expect(withHistory[0].base_hours).toBe(Math.round(ROW.base_hours * 1.5 * 2) / 2);
});
