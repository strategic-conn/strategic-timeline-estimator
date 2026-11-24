import { expect, test } from "@playwright/test";

import { waitForApp } from "./helpers";

/**
 * The "Draft from client scope" demo is gone: the real feature (New estimate →
 * "Let Esther estimate", e2e/esther-estimate.spec.ts) replaced it on
 * 2026-11-21. Its old link still lands back on the Estimator list.
 */
test("the scope demo is hidden: no entry, and its link redirects", async ({ page }) => {
  await page.goto("/proposals");
  await waitForApp(page);
  await expect(page.getByRole("link", { name: "Try the demo" })).toHaveCount(0);
  await expect(page.getByText("Demo UI only")).toHaveCount(0);

  await page.goto("/proposals/scope-demo");
  await expect(page).toHaveURL(/\/proposals$/);
});
