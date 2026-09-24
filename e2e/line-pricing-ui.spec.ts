import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * Price per line, in the real editor (pricing plan Phase 3).
 *
 * A catalog task added to an estimate must SNAPSHOT its role's rate: "Industry
 * Selector" is WordPress, IT Level 2, 8 base hours — so at the seeded $120/h it
 * is $960, and the header, the line and the Adjust tab must all say so. The
 * estimate is a throwaway "[E2E]" row, created and deleted here; the live rates
 * table is only read.
 */
test("a new catalog line is priced at its role's rate", async ({ page }) => {
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

  // Read the live IT Level 2 rate rather than assume the seed: an admin may
  // have changed it, and the line must follow the TABLE.
  const rateRow = await (
    await fetch(`${url}/rest/v1/hourly_rates?responsible=eq.IT&level=eq.2&select=rate`, {
      headers: h,
    })
  ).json();
  const rate = Number(rateRow?.[0]?.rate);
  test.skip(!Number.isFinite(rate) || rate <= 0, "no IT Level 2 rate");
  const expected = Math.round(8 * rate);
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;

  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const made = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: `${E2E_PREFIX} pricing ${run}`,
      platform: "wordpress",
      line_items: [],
      addons: {
        pm_enabled: false,
        pm_basis: "simple",
        pm_pct: 10,
        responsive_enabled: false,
        responsive_pct: 25,
        design_enabled: false,
        design_pct: 35,
        qa_enabled: false,
        qa_pct: 20,
      },
    }),
  });
  const id = (await made.json())?.[0]?.id;
  expect(id, "fixture estimate").toBeTruthy();

  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^line items/i }).click();
    await page.getByRole("button", { name: /browse catalog/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/search all categories/i).fill("Industry Selector");
    await dialog.getByText("Industry Selector", { exact: true }).click();
    await dialog.getByRole("button", { name: /add 1 to quote/i }).click();
    await expect(dialog).toBeHidden();

    // The line: its role, its snapshot rate, its price.
    const main = page.locator("main");
    await expect(main.getByText(/· IT L2 · \$/).first()).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText(money(expected)).first()).toBeVisible();

    // The header agrees, and says the single rate in use.
    const header = main.locator("header").first();
    await expect(header.getByText(money(expected))).toBeVisible();
    await expect(header.getByText(new RegExp(`at \\$${rate}/h`))).toBeVisible();

    // Adjust tab: priced at today's rates, so nothing to update.
    await page.getByRole("tab", { name: /^adjust/i }).click();
    await expect(main.getByText(/matches today's rates/i)).toBeVisible();

    // And it was PERSISTED with the snapshot, not just shown.
    await expect
      .poll(async () => {
        const row = await (
          await fetch(`${url}/rest/v1/proposals?id=eq.${id}&select=line_items`, { headers: h })
        ).json();
        const li = row?.[0]?.line_items?.[0];
        return li ? `${li.responsible}|${li.level}|${li.rate}` : null;
      }, { timeout: 15_000 })
      .toBe(`IT|2|${rate}`);
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
