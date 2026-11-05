import { expect, test } from "@playwright/test";

import {
  DEFAULT_ADDONS,
  LEGACY_HOURLY_RATE,
  lineAmount,
  quotePricing,
  quoteTotals,
  rateSummary,
  splitAmount,
  splitHours,
} from "../lib/constants/proposal-estimator";
import { DEFAULT_HOURLY_RATES, type HourlyRate } from "../lib/pricing/hourly-rates";
import {
  FREEHAND_ROLE,
  PHASE_ROLE,
  currentAddonRates,
  defaultRoleFor,
  rateBreakdown,
  repriceToCurrentRates,
  withPricing,
} from "../lib/pricing/line-pricing";
import { catalogForPlatform } from "../lib/proposal-catalog";
import type {
  ClientQuote,
  ProposalLineItem,
  ProposalTier,
} from "../types/proposal.types";

/**
 * Pricing plan Phase 3 — price per line. Pure: no browser, no network.
 *
 * The first test is the one that matters most. Every quote saved before Phase 3
 * has no rate anywhere, and must price EXACTLY as the old `round(hours x $100)`
 * did — six live quotes are linked to Zoho deals, one Closed Won at $70,800.
 */

/** Deterministic PRNG, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const TIERS: ProposalTier[] = ["basic", "advanced", "custom"];

function line(over: Partial<ProposalLineItem> = {}): ProposalLineItem {
  return {
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
    ...over,
  };
}

function quote(over: Partial<ClientQuote> = {}): ClientQuote {
  return {
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
  } as ClientQuote;
}

test.describe("price per line", () => {
  test("a pre-Phase-3 quote prices exactly as hours x $100 (3,000 random quotes)", () => {
    const r = rng(20260924);
    for (let n = 0; n < 3000; n++) {
      const lines = Array.from({ length: 1 + Math.floor(r() * 25) }, () =>
        line({
          // Two-decimal hours, as the app stores them.
          base_hours: Math.round(r() * 4000) / 100,
          tier: TIERS[Math.floor(r() * 3)],
          quantity: 1 + Math.floor(r() * 4),
        }),
      );
      const q = quote({
        line_items: lines,
        requirements_unclear: r() < 0.3,
        addons: {
          ...DEFAULT_ADDONS,
          pm_enabled: r() < 0.5,
          pm_pct: [10, 15, 12.5][Math.floor(r() * 3)],
          responsive_enabled: r() < 0.5,
          design_enabled: r() < 0.5,
          qa_enabled: r() < 0.5,
        },
      });
      const old = Math.round(quoteTotals(q).grandHours * 100);
      expect(quotePricing(q).grandAmount, `quote #${n}`).toBe(old);
    }
  });

  test("lines always add up to the total, whatever the rates", () => {
    const q = quote({
      addons: { ...DEFAULT_ADDONS, responsive_enabled: false, design_enabled: false, qa_enabled: false, pm_enabled: false },
      line_items: [
        line({ base_hours: 1.25, rate: 87.5 }),
        line({ base_hours: 3.33, rate: 120 }),
        line({ base_hours: 2, rate: 0 }),
      ],
    });
    const p = quotePricing(q);
    const sum = q.line_items.reduce((s, li) => s + lineAmount(li, false), 0);
    expect(p.devAmount).toBe(sum);
    expect(p.grandAmount).toBe(sum);
    expect(p.uniformRate).toBeNull();
    expect(rateSummary(p)).toMatch(/^avg \$/);
  });

  test("add-on hours use their own rate snapshots", () => {
    const q = quote({
      line_items: [line({ base_hours: 100, rate: 100 })],
      addons: {
        ...DEFAULT_ADDONS,
        responsive_enabled: false,
        design_enabled: false,
        qa_enabled: false,
        pm_enabled: true,
        pm_pct: 10,
        rates: { responsive: 100, design: 100, qa: 80, pm: 80 },
      },
    });
    const p = quotePricing(q);
    expect(p.totals.pmHours).toBe(10);
    expect(p.pmAmount).toBe(800); // 10 h at the PM rate, not $100
    expect(p.grandAmount).toBe(10_000 + 800);
  });

  test("one rate throughout reads 'at $X/h'", () => {
    const p = quotePricing(quote({ line_items: [line({ rate: 120 })], addons: { ...DEFAULT_ADDONS, responsive_enabled: false, design_enabled: false, qa_enabled: false, pm_enabled: false } }));
    expect(p.uniformRate).toBe(120);
    expect(rateSummary(p)).toBe("at $120/h");
  });

  test("money splits across products sum exactly and match the old split", () => {
    for (const [total, parts] of [[70_800, 3], [10_001, 2], [1, 3], [0, 4], [999, 7]]) {
      const out = splitAmount(total, parts);
      expect(out.reduce((a, b) => a + b, 0), `${total}/${parts}`).toBe(total);
    }
    // Legacy equivalence: money split == old "hour share x $100".
    for (const [hours, parts] of [[708, 3], [100.01, 2], [366, 4]]) {
      const old = splitHours(hours, parts).map((h) => Math.round(h * LEGACY_HOURLY_RATE));
      expect(splitAmount(Math.round(hours * 100), parts)).toEqual(old);
    }
  });
});

test.describe("who a line is and what it costs", () => {
  const rates: HourlyRate[] = DEFAULT_HOURLY_RATES;

  test("a catalog line takes its role from the catalog row", () => {
    const row = catalogForPlatform("wordpress").find((r) => r.level === 2)!;
    const priced = withPricing(line({ catalog_id: row.id }), "wordpress", rates);
    expect(priced.responsible).toBe(row.responsible);
    expect(priced.level).toBe(2);
    expect(priced.rate).toBe(row.responsible === "IT" ? 120 : priced.rate);
  });

  test("a guided line takes its role from its phase; freehand is IT Level 1", () => {
    expect(defaultRoleFor({ catalog_id: null, module: "QA & Testing" }, "wordpress")).toEqual(PHASE_ROLE.qa);
    expect(defaultRoleFor({ catalog_id: null, module: "Discovery & Strategy" }, "wordpress")).toEqual(PHASE_ROLE.discovery);
    expect(defaultRoleFor({ catalog_id: null, module: null }, "wordpress")).toEqual(FREEHAND_ROLE);
    expect(withPricing(line(), "custom", rates).rate).toBe(100);
  });

  test("an existing snapshot is never replaced by withPricing", () => {
    const priced = withPricing(line({ responsible: "IT", level: 2, rate: 95 }), "wordpress", rates);
    expect(priced.rate).toBe(95);
  });

  test("Update to current rates re-snapshots lines and add-ons", () => {
    const raised = rates.map((r) =>
      r.responsible === "IT" && r.level === 2 ? { ...r, rate: 150 } : r,
    );
    const q = quote({
      line_items: [
        line({ responsible: "IT", level: 2, rate: 120 }),
        line({ responsible: "Creative", level: 1, rate: 100 }),
        line({}), // legacy: no role, no rate -> freehand IT L1 at today's $100
      ],
    });
    const out = repriceToCurrentRates(q, raised);
    expect(out.line_items[0].rate).toBe(150);
    expect(out.line_items[1]).toBe(q.line_items[1]); // untouched, same object
    expect(out.line_items[2]).toMatchObject({ responsible: "IT", level: 1, rate: 100 });
    expect(out.changedLines).toBe(2);
    expect(out.addonRates).toEqual(currentAddonRates(raised));
    expect(out.addonRates.pm).toBe(80);
  });
});

test.describe("risk buffer is priced", () => {
  const noAddons = {
    ...DEFAULT_ADDONS,
    responsive_enabled: false,
    design_enabled: false,
    qa_enabled: false,
    pm_enabled: false,
  };

  test("adds the same share of hours and money, at the quote's own rate", () => {
    const p = quotePricing(
      quote({
        line_items: [line({ base_hours: 40, rate: 100 })],
        addons: noAddons,
        risk_buffer_pct: 10,
      }),
    );
    expect(p.subtotalAmount).toBe(4_000);
    expect(p.bufferPct).toBe(10);
    expect(p.bufferHours).toBe(4);
    expect(p.bufferAmount).toBe(400);
    expect(p.grandAmount).toBe(4_400);
    expect(p.pricedHours).toBe(44);
    // Work hours (what the timeline schedules) are not touched.
    expect(p.totals.grandHours).toBe(40);
    expect(rateSummary(p)).toBe("at $100/h");
  });

  test("no buffer, no line: identical to before", () => {
    const q = quote({ line_items: [line({ base_hours: 7, rate: 120 })], addons: noAddons });
    const p = quotePricing({ ...q, risk_buffer_pct: 0 });
    expect(p.bufferAmount).toBe(0);
    expect(p.grandAmount).toBe(p.subtotalAmount);
    expect(p.pricedHours).toBe(p.totals.grandHours);
  });

  test("a quote approved before the buffer was priced keeps its agreed price", () => {
    const base = {
      line_items: [line({ base_hours: 40, rate: 100 })],
      addons: noAddons,
      risk_buffer_pct: 10,
    };
    // Approved, no stamp -> agreed before this change -> unchanged.
    expect(quotePricing(quote({ ...base, status: "approved" })).grandAmount).toBe(4_000);
    // Billed (PO) without approval stamp -> frozen too.
    expect(
      quotePricing(quote({ ...base, status: "sent", pbs: { po_no: "STR-1" } as ClientQuote["pbs"] }))
        .grandAmount,
    ).toBe(4_000);
    // Approved since -> stamped -> buffer stays priced.
    expect(
      quotePricing(
        quote({
          ...base,
          status: "approved",
          schedule_plan: { strategy: "efficient", buffer_priced: true },
        }),
      ).grandAmount,
    ).toBe(4_400);
    // Draft/sent -> priced.
    expect(quotePricing(quote({ ...base, status: "sent" })).grandAmount).toBe(4_400);
  });
});

test.describe("rates breakdown", () => {
  test("groups by role + level and adds up to the price, buffer included", () => {
    const q = quote({
      line_items: [
        line({ base_hours: 10, rate: 120, responsible: "IT", level: 2 }),
        line({ base_hours: 5, rate: 120, responsible: "IT", level: 2 }),
        line({ base_hours: 8, rate: 80, responsible: "Project Manager", level: 1 }),
        line({ base_hours: 3, rate: 100 }), // no role
      ],
      addons: { ...DEFAULT_ADDONS, responsive_enabled: false, design_enabled: false, qa_enabled: true, qa_pct: 20, pm_enabled: false, rates: { responsive: 100, design: 100, qa: 80, pm: 80 } },
      risk_buffer_pct: 10,
    });
    const b = rateBreakdown(q);
    const p = quotePricing(q);
    const it = b.rows.find((r) => r.label === "IT · Level 2")!;
    expect(it).toMatchObject({ rate: 120, hours: 15, amount: 1_800 });
    expect(b.rows.find((r) => r.label === "No role set")).toMatchObject({ rate: 100, hours: 3 });
    expect(b.rows.find((r) => r.label === "QA Tester · Level 1")?.rate).toBe(80);
    expect(b.buffer).toEqual({ pct: 10, hours: p.bufferHours, amount: p.bufferAmount });
    const sum = b.rows.reduce((s, r) => s + r.amount, 0) + (b.buffer?.amount ?? 0);
    expect(sum).toBe(p.grandAmount);
    expect(b.totalAmount).toBe(p.grandAmount);
    expect(b.totalHours).toBe(p.pricedHours);
    expect(b.rows[0].label).toBe("IT · Level 2"); // busiest first
  });
});
