import { expect, test } from "@playwright/test";

import { hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The "Draft from client scope" DEMO: reachable from the Estimator, clearly
 * labelled, clickable end to end — and it writes nothing (any non-GET to
 * Supabase or the app's API during the walk fails the test).
 */
test("the scope demo walks end to end, says it's a demo, and writes nothing", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (r.method() !== "GET" && (u.includes("/rest/v1/") || u.includes("/api/"))) {
      // Tour progress is the one write any page may make on load.
      if (!u.includes("tour_progress")) writes.push(`${r.method()} ${u}`);
    }
  });

  await page.goto("/proposals");
  await waitForApp(page);
  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/proposals\/scope-demo$/);
  await expect(page.getByText("Demo UI only.")).toBeVisible();

  await page.getByRole("button", { name: /draft with esther/i }).click();
  await expect(page.getByText("Esther is drafting your lines")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review Esther's draft" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Demo UI only.")).toBeVisible();

  const add = page.getByRole("button", { name: /^Add \d+ lines \(demo\)/ });
  await expect(add).toHaveText(/Add 13 lines/);
  await page.getByRole("checkbox", { name: "Include Plugin cleanup" }).click();
  await expect(add).toHaveText(/Add 12 lines/);

  // Clicking a line points at its source sentences.
  await page.getByRole("button", { name: "Plugin cleanup", exact: true }).click();

  expect(await hasHorizontalScroll(page)).toBe(false);
  await add.click();
  await expect(page.getByText("12 lines added", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Save to task library" }).click();
  await expect(page.getByText(/Demo only — nothing was saved/)).toBeVisible();

  expect(writes, "the demo must not write anything").toEqual([]);
});
