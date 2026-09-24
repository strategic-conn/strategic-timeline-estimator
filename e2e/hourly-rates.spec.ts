import { expect, test } from "@playwright/test";

import {
  DEFAULT_HOURLY_RATES,
  rateFor,
  rateKey,
  sortRates,
  validateRateDraft,
} from "../lib/pricing/hourly-rates";
import { waitForApp } from "./helpers";

/**
 * Hourly rates (pricing plan, Phase 1). Pure checks first — no browser — then
 * the settings card as the E2E bot sees it. The bot is a MANAGER, so this
 * covers the read-only path; the admin write path and every refusal are proven
 * against the database by scripts/security-probe.mjs (P10-P13).
 */
const roles = ["IT", "Project Coordinator"];
const draft = (it1: string, it2: string, pc1 = "0", pc2 = "0") => ({
  [rateKey("IT", 1)]: it1,
  [rateKey("IT", 2)]: it2,
  [rateKey("Project Coordinator", 1)]: pc1,
  [rateKey("Project Coordinator", 2)]: pc2,
});

test.describe("hourly rate rules", () => {
  test("the workbook's rates are the defaults, Coordinator at $0", () => {
    expect(rateFor(DEFAULT_HOURLY_RATES, "IT", 2)).toBe(120);
    expect(rateFor(DEFAULT_HOURLY_RATES, "Creative", 2)).toBe(130);
    expect(rateFor(DEFAULT_HOURLY_RATES, "Project Coordinator", 1)).toBe(0);
    expect(rateFor(DEFAULT_HOURLY_RATES, "Nobody", 1)).toBeNull();
    expect(DEFAULT_HOURLY_RATES).toHaveLength(10);
  });

  test("a valid table parses to numbers", () => {
    const { errors, parsed } = validateRateDraft(roles, draft("100", "120.50"));
    expect(errors).toEqual({});
    expect(parsed?.[rateKey("IT", 2)]).toBe(120.5);
  });

  test("Level 2 may equal Level 1 (Coordinator is $0 at both)", () => {
    expect(validateRateDraft(roles, draft("100", "100")).parsed).not.toBeNull();
  });

  test("Level 2 below Level 1 is refused, on the Level 2 cell", () => {
    const { errors, parsed } = validateRateDraft(roles, draft("120", "100"));
    expect(parsed).toBeNull();
    expect(errors[rateKey("IT", 2)]).toMatch(/below Level 1/);
    expect(errors[rateKey("IT", 1)]).toBeUndefined();
  });

  test("blank, negative, non-numeric, 3-decimal and huge rates are refused", () => {
    for (const bad of ["", "-5", "abc", "10.555", "10001", "1e3"]) {
      const { errors } = validateRateDraft(roles, draft(bad, "200"));
      expect(errors[rateKey("IT", 1)], JSON.stringify(bad)).toBeTruthy();
    }
  });

  test("known roles sort in workbook order, unknown ones after", () => {
    const shuffled = [
      {
        responsible: "Zeta",
        level: 1 as const,
        rate: 1,
        updated_by: null,
        updated_at: null,
      },
      ...DEFAULT_HOURLY_RATES.slice().reverse(),
    ];
    const order = [...new Set(sortRates(shuffled).map((r) => r.responsible))];
    expect(order).toEqual([
      "IT",
      "Creative",
      "Project Manager",
      "QA Tester",
      "Project Coordinator",
      "Zeta",
    ]);
  });
});

test("a manager sees the rates read-only in Settings", async ({ page }) => {
  await page.goto("/settings");
  await waitForApp(page);
  await page.getByRole("tab", { name: /workspace/i }).click();

  const card = page
    .locator('[data-slot="card"]')
    .filter({
      has: page.locator('[data-slot="card-title"]', {
        hasText: /^Hourly rates$/,
      }),
    });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("Project Coordinator")).toBeVisible();
  await expect(card.getByText(/\$\d+(\.\d{2})?\/h/).first()).toBeVisible();

  // Read-only: no inputs, no Save, and it says why.
  await expect(card.locator("input")).toHaveCount(0);
  await expect(card.getByRole("button", { name: /save rates/i })).toHaveCount(
    0,
  );
  await expect(card.getByText(/only admins can change rates/i)).toBeVisible();
});
