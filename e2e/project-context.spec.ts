import { expect, test } from "@playwright/test";

import { analyzeDiscovery } from "../lib/discovery";
import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { contextOf, withQuoteAnswers } from "../lib/discovery/context-inputs";
import {
  DISCOVERY_QUESTIONS,
  DISCOVERY_SECTIONS,
  SETUP_SECTION,
} from "../lib/discovery/questions";
import type { DiscoveryProject } from "../types/discovery.types";
import type { ClientQuote } from "../types/proposal.types";

/**
 * Goal, redesign and regulated industry moved from questionnaire section 1 to
 * Setup (2026-11-12, `proposals.context`), and section 7's leftovers merged
 * into section 1. Pure: no browser, no live data.
 */
const DISC = (over: Partial<DiscoveryProject> = {}) =>
  ({
    ...createEmptyDiscoveryProject(),
    id: "d",
    platform: "wordpress",
    total_pages: 8,
    unique_templates: 3,
    created_at: "",
    updated_at: "",
    ...over,
  }) as DiscoveryProject;

const QUOTE = (over: Partial<ClientQuote> = {}): ClientQuote =>
  ({
    id: "q1",
    title: "Q",
    platform: "wordpress",
    status: "draft",
    requirements_unclear: false,
    line_items: [],
    addons: {},
    discovery: null,
    ...over,
  }) as unknown as ClientQuote;

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

test("Setup wins, the old questionnaire answer is the fallback, the platform's goal beats both", () => {
  const discovery = DISC({ primary_goal: "lead_gen", is_redesign: true, current_url: "https://old.example" });
  // Nothing on Setup yet: an existing guided estimate keeps its answers.
  expect(contextOf(QUOTE({ discovery }))).toMatchObject({
    primary_goal: "lead_gen",
    is_redesign: true,
    current_url: "https://old.example",
  });
  // Set on Setup: that is the answer — including switching a toggle off.
  expect(
    contextOf(QUOTE({ discovery, context: { primary_goal: "brand_awareness", is_redesign: false } })),
  ).toMatchObject({ primary_goal: "brand_awareness", is_redesign: false });
  // Shopify implies e-commerce, whatever was stored (the goal is hidden there).
  expect(contextOf(QUOTE({ platform: "shopify" as never, context: { primary_goal: "lead_gen" } })).primary_goal).toBe(
    "ecommerce",
  );
});

test("a redesign set on Setup adds Discovery hours to a guided estimate", () => {
  const discovery = DISC();
  const hours = (q: ClientQuote) =>
    analyzeDiscovery(withQuoteAnswers(q.discovery!, q)).estimate.phases.find((p) => p.id === "discovery")!.mid;
  const plain = hours(QUOTE({ discovery }));
  const redesign = hours(QUOTE({ discovery, context: { is_redesign: true, current_url: "https://x.example" } }));
  expect(redesign).toBeGreaterThan(plain);
});

test("the questionnaire is 7 steps and never asks what Setup asks", () => {
  expect(DISCOVERY_SECTIONS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 8]);
  expect(DISCOVERY_SECTIONS[0].title).toBe("Client & Context");
  const setupIds = DISCOVERY_QUESTIONS.filter((q) => q.section === SETUP_SECTION).map((q) => q.id);
  expect(setupIds).toEqual(
    expect.arrayContaining(["primary_goal", "is_redesign", "current_url", "regulated_industry", "regulated_type"]),
  );
  // Stakeholders and first-time client moved into section 1.
  const s1 = DISCOVERY_QUESTIONS.filter((q) => q.section === 1).map((q) => q.id);
  expect(s1).toEqual(expect.arrayContaining(["stakeholder_count", "first_time_client"]));
  expect(DISCOVERY_QUESTIONS.some((q) => q.section === 7)).toBe(false);
});
