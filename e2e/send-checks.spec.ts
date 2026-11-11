import { expect, test } from "@playwright/test";

import { isCustomLine, needsDevConfirm, sendChecks } from "../lib/estimator/send-checks";
import { NEW_ESTIMATE_ADDONS } from "../lib/constants/proposal-estimator";
import type { ClientQuote, ProposalLineItem } from "../types/proposal.types";

/**
 * The "Before you send" rules (2026-11-12): custom lines need a developer's
 * confirmation, and a line-items-only estimate is checked for what the
 * questionnaire would have covered. Pure — no browser, no live data.
 */
const LINE = (over: Partial<ProposalLineItem> = {}): ProposalLineItem => ({
  id: Math.random().toString(36).slice(2),
  title: "Custom widget",
  module: null,
  category_id: null,
  catalog_id: null,
  base_hours: 8,
  tier: "basic",
  quantity: 1,
  hours: 8,
  depends_on: [],
  ...over,
});

const QUOTE = (over: Partial<ClientQuote> = {}): ClientQuote =>
  ({
    id: "q",
    title: "Q",
    platform: "wordpress",
    status: "draft",
    requirements_unclear: false,
    line_items: [],
    addons: { ...NEW_ESTIMATE_ADDONS },
    discovery: null,
    context: null,
    ...over,
  }) as unknown as ClientQuote;

const ids = (q: ClientQuote) => sendChecks(q).map((c) => c.id);

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

test("only a titled custom line with hours needs a developer, until confirmed", () => {
  expect(needsDevConfirm(LINE())).toBe(true);
  expect(needsDevConfirm(LINE({ hours_confirmed: true }))).toBe(false);
  expect(needsDevConfirm(LINE({ catalog_id: 12 }))).toBe(false); // from the catalog
  expect(needsDevConfirm(LINE({ module: "Development" }))).toBe(false); // from the questionnaire
  expect(needsDevConfirm(LINE({ title: "  " }))).toBe(false); // the blank starter row
  expect(isCustomLine(LINE({ module: "Homepage - Standard" }))).toBe(true); // a catalog MODULE name isn't a phase
});

test("a bare line-items estimate gets every check; each fix clears its own", () => {
  const bare = QUOTE({ line_items: [LINE()] });
  expect(ids(bare)).toEqual(["dev-hours", "no-pm", "no-qa", "no-assumptions", "no-content-seo"]);

  const fixed = QUOTE({
    line_items: [LINE({ hours_confirmed: true }), LINE({ title: "SEO setup", catalog_id: 40 })],
    addons: { ...NEW_ESTIMATE_ADDONS, pm_enabled: true, qa_enabled: true },
    context: { assumptions: ["Client supplies all copy"] },
  });
  expect(ids(fixed)).toEqual([]);
  // A Project Manager / QA Tester LINE counts as much as the add-on.
  const byLines = QUOTE({
    line_items: [
      LINE({ hours_confirmed: true, responsible: "Project Manager", level: 1, title: "Kickoff & planning" }),
      LINE({ hours_confirmed: true, responsible: "QA Tester", level: 1, title: "Browser testing" }),
    ],
  });
  expect(ids(byLines)).not.toContain("no-pm");
  expect(ids(byLines)).not.toContain("no-qa");
});

test("a guided estimate is only checked for custom hours; an approved one for nothing", () => {
  const guided = QUOTE({ discovery: {} as never, line_items: [LINE()] });
  expect(ids(guided)).toEqual(["dev-hours"]);
  expect(ids(QUOTE({ status: "approved", line_items: [LINE()] }))).toEqual([]);
});
