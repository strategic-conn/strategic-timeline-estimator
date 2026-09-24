import { expect, test } from "@playwright/test";

import {
  CATALOG_CATEGORIES,
  catalogForPlatform,
  categoryIdByName,
  categoryName,
  type ProposalPlatform,
} from "../lib/proposal-catalog";
import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * Catalog v3 (pricing plan, Phase 2) — built from the pricing workbook by
 * scripts/build-catalog.mjs. Pure checks on the shipped data first, then the
 * catalog browser's role/level filters on a throwaway "[E2E]" estimate.
 */
const PLATFORMS: [ProposalPlatform, number][] = [
  ["wordpress", 136],
  ["squarespace", 67],
  ["shopify", 69],
  ["wix", 70],
  ["php", 118],
  ["react_next", 137],
];
const ROLES = ["IT", "Creative", "Project Manager", "QA Tester", "Project Coordinator"];

test.describe("catalog v3 data", () => {
  test("task counts match the workbook's Summary tab", () => {
    for (const [p, n] of PLATFORMS) expect(catalogForPlatform(p), p).toHaveLength(n);
  });

  test("ids are unique per platform (React reused 121-123 before)", () => {
    // Duplicate ids made the browser tick two tasks at once and add both.
    for (const [p] of PLATFORMS) {
      const ids = catalogForPlatform(p).map((i) => i.id);
      expect(new Set(ids).size, p).toBe(ids.length);
    }
  });

  test("every task has a known role, a level and a real category", () => {
    const catIds = new Set(CATALOG_CATEGORIES.map((c) => c.id));
    for (const [p] of PLATFORMS) {
      for (const it of catalogForPlatform(p)) {
        const where = `${p} #${it.id} ${it.name}`;
        expect(ROLES, where).toContain(it.responsible);
        expect([1, 2], where).toContain(it.level);
        if (it.category_id != null) expect(catIds.has(it.category_id), where).toBe(true);
      }
    }
  });

  test("module and task names use a plain hyphen, never an en/em dash", () => {
    // The workbook writes "Configurator – 3D"; the catalog has always said
    // "Configurator - 3D". Two spellings would split every module in two.
    for (const [p] of PLATFORMS) {
      for (const it of catalogForPlatform(p)) {
        expect(`${it.module} ${it.name}`, `${p} #${it.id}`).not.toMatch(/[–—]/);
      }
    }
  });

  test("categories are found by name, never by a literal id", () => {
    // Renumbered in v3: old 5 was E-Commerce, new 5 is Custom Tools.
    const ecommerce = categoryIdByName("E-Commerce");
    expect(ecommerce).not.toBeNull();
    expect(categoryName(ecommerce)).toBe("E-Commerce");
    expect(categoryName(5)).toBe("Custom Tools");
    expect(categoryIdByName("No such category")).toBeNull();
  });
});

test("the catalog browser filters by role and level", async ({ page }) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const made = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ title: `${E2E_PREFIX} catalog ${run}`, platform: "wordpress" }),
  });
  const id = (await made.json())?.[0]?.id;
  expect(id, "fixture estimate").toBeTruthy();

  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^line items/i }).click();
    await page.getByRole("button", { name: /browse catalog/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Catalog · WordPress/)).toBeVisible({ timeout: 20_000 });
    const filters = dialog.getByRole("group", { name: /filter by role and level/i });

    // Level 2 only: every visible task line says Level 2.
    await filters.getByRole("button", { name: "Level 2", exact: true }).click();
    const levels = await dialog.getByText(/ · Level [12]$/).allInnerTexts();
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((t) => t.endsWith("Level 2")), levels.join("|")).toBe(true);

    // Creative + any level: only Creative tasks.
    await filters.getByRole("button", { name: "Any level" }).click();
    await filters.getByRole("button", { name: "Creative", exact: true }).click();
    const roles = await dialog.getByText(/ · Level [12]$/).allInnerTexts();
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.every((t) => t.startsWith("Creative")), roles.join("|")).toBe(true);

    // Things to Consider notes render.
    await filters.getByRole("button", { name: "All roles" }).click();
    await expect(dialog.locator("p.italic").first()).toBeVisible();
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
