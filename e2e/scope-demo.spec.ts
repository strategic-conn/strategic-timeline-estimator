import { expect, test } from "@playwright/test";

import { waitForApp } from "./helpers";

/**
 * The "Draft from client scope" demo is HIDDEN (2026-10-28): no entry on the
 * Estimator, and its old link lands back on the Estimator list. The demo itself
 * is parked in components/features/proposals/ScopeDraftDemo.tsx; when it comes
 * back, restore the walk-through test from git history (it also proved the demo
 * writes nothing).
 */
test("the scope demo is hidden: no entry, and its link redirects", async ({ page }) => {
  await page.goto("/proposals");
  await waitForApp(page);
  await expect(page.getByRole("link", { name: "Try the demo" })).toHaveCount(0);
  await expect(page.getByText("Demo UI only")).toHaveCount(0);

  await page.goto("/proposals/scope-demo");
  await expect(page).toHaveURL(/\/proposals$/);
});
