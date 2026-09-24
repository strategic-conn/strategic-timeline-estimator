import { expect, test } from "@playwright/test";

import { DEFAULT_ADDONS, quoteTotals } from "../lib/constants/proposal-estimator";
import {
  phaseIdForLineItem,
  phaseLabelForLineItem,
  resultFromQuote,
} from "../lib/discovery/from-line-items";
import type { PhaseId } from "../types/discovery.types";
import type { ClientQuote, ProposalLineItem, ProposalTier } from "../types/proposal.types";

/**
 * Catalog estimates scheduled by role (pricing plan Phase 5). Pure.
 *
 * A catalog / freehand line goes to the phase of the role that does it —
 * Creative → Design, QA Tester → QA, Project Coordinator → Content, Project
 * Manager → Discovery, IT → Development. Guided lines keep their own phase.
 * Two things must hold whatever the mix: an IT-only estimate schedules exactly
 * as before, and no line is ever placed in a phase the schedule doesn't have
 * (that line would have no sprint and fall into the backlog).
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const TIERS: ProposalTier[] = ["basic", "advanced", "custom"];
const ROLES = ["IT", "Creative", "QA Tester", "Project Coordinator", "Project Manager", null];

const line = (over: Partial<ProposalLineItem> = {}): ProposalLineItem => ({
  id: Math.random().toString(36).slice(2),
  title: "Line",
  module: null,
  category_id: null,
  catalog_id: null,
  base_hours: 4,
  tier: "basic",
  quantity: 1,
  hours: 4,
  depends_on: [],
  responsible: "IT",
  level: 1,
  ...over,
});
const quote = (over: Partial<ClientQuote> = {}): ClientQuote =>
  ({
    id: "q1",
    title: "Q",
    platform: "wordpress",
    status: "draft",
    line_items: [],
    addons: { ...DEFAULT_ADDONS },
    requirements_unclear: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  }) as ClientQuote;

function randomQuote(r: () => number, roles: (string | null)[]): ClientQuote {
  const lines = Array.from({ length: 1 + Math.floor(r() * 20) }, () => {
    const base = Math.round(r() * 400) / 10;
    const tier = TIERS[Math.floor(r() * 3)];
    const quantity = 1 + Math.floor(r() * 3);
    return line({
      title: r() < 0.05 ? "  " : "Task",
      base_hours: base,
      tier,
      quantity,
      hours: base * quantity,
      responsible: roles[Math.floor(r() * roles.length)],
    });
  });
  return quote({
    line_items: lines,
    requirements_unclear: r() < 0.3,
    addons: {
      ...DEFAULT_ADDONS,
      responsive_enabled: r() < 0.5,
      design_enabled: r() < 0.5,
      qa_enabled: r() < 0.5,
      pm_enabled: r() < 0.5,
    },
  });
}

/** What resultFromQuote drew before Phase 5, phase by phase (hours only). */
function legacyPhaseHours(q: ClientQuote): [PhaseId, number][] {
  const t = quoteTotals(q);
  const out: [PhaseId, number][] = [];
  if (t.designHours > 0) out.push(["design", t.designHours]);
  if (t.devHours + t.responsiveHours > 0) out.push(["development", t.devHours + t.responsiveHours]);
  if (t.qaHours > 0) out.push(["qa", t.qaHours]);
  return out;
}

test("an IT-only estimate schedules exactly as before (300 random quotes)", () => {
  const r = rng(20260925);
  for (let n = 0; n < 300; n++) {
    const q = randomQuote(r, ["IT", null]); // null = a legacy line with no role
    const res = resultFromQuote(q);
    expect(res.estimate.phases.map((p) => [p.id, p.mid])).toEqual(legacyPhaseHours(q));
  }
});

test("any mix: total hours unchanged, and every line's phase is on the timeline", () => {
  const r = rng(7);
  for (let n = 0; n < 300; n++) {
    const q = randomQuote(r, ROLES);
    const res = resultFromQuote(q);
    const drawn = res.estimate.phases.reduce((s, p) => s + p.mid, 0);
    const legacy = legacyPhaseHours(q).reduce((s, [, h]) => s + h, 0);
    expect(Math.abs(drawn - legacy)).toBeLessThan(0.005);
    const onTimeline = new Set(res.timeline.phases.map((p) => p.id));
    for (const li of q.line_items.filter((l) => l.title.trim() && l.hours > 0)) {
      expect(onTimeline.has(phaseIdForLineItem(li, onTimeline))).toBe(true);
      // ...and with no guard it lands in the same phase (the timeline was built from it).
      expect(phaseIdForLineItem(li)).toBe(phaseIdForLineItem(li, onTimeline));
    }
  }
});

test("roles map to phases; IT and unknown roles stay in Development", () => {
  const cases: [string | null, PhaseId][] = [
    ["Creative", "design"],
    ["QA Tester", "qa"],
    ["Project Coordinator", "content"],
    ["Project Manager", "discovery"],
    ["IT", "development"],
    ["Someone New", "development"],
    [null, "development"],
  ];
  for (const [responsible, phase] of cases) {
    expect(phaseIdForLineItem({ module: "Hero Section", responsible })).toBe(phase);
  }
  expect(phaseLabelForLineItem({ module: null, responsible: "Creative" })).toBe("Design & UX");
});

test("guided lines keep their phase whatever their role", () => {
  // A guided "Development" line done by QA stays in Development.
  expect(phaseIdForLineItem({ module: "Development", responsible: "QA Tester" })).toBe("development");
  expect(phaseIdForLineItem({ module: "SEO Setup", responsible: "Creative" })).toBe("seo");
});

test("a role phase the schedule lacks falls back to Development — never the backlog", () => {
  const guidedPhases = new Set<PhaseId>(["discovery", "development", "qa", "launch"]);
  expect(phaseIdForLineItem({ module: "Illustration", responsible: "Creative" }, guidedPhases)).toBe(
    "development",
  );
  expect(phaseIdForLineItem({ module: "Visual QA", responsible: "QA Tester" }, guidedPhases)).toBe("qa");
});

test("a Creative line lands in Design with the design add-on, not in Development", () => {
  const q = quote({
    line_items: [
      line({ title: "Homepage build", base_hours: 20, hours: 20 }),
      line({ title: "Custom icons", base_hours: 6, hours: 6, responsible: "Creative" }),
      line({ title: "Cross-browser pass", base_hours: 4, hours: 4, responsible: "QA Tester" }),
    ],
    addons: { ...DEFAULT_ADDONS, design_enabled: true, design_pct: 10, qa_enabled: false, responsive_enabled: false, pm_enabled: false },
  });
  const res = resultFromQuote(q);
  const byId = Object.fromEntries(res.estimate.phases.map((p) => [p.id, p]));
  expect(Object.keys(byId)).toEqual(["design", "development", "qa"]);
  expect(byId.design.mid).toBe(6 + 3); // the line + 10% of 30 dev hours
  expect(byId.design.tasks.map((t) => t.name)).toEqual(["Design & UX", "Custom icons"]);
  expect(byId.development.mid).toBe(20);
  expect(byId.qa.mid).toBe(4);
  // Negative control: before Phase 5 the icons and the QA pass were Development work.
  expect(legacyPhaseHours(q)).toEqual([
    ["design", 3],
    ["development", 30],
  ]);
});
