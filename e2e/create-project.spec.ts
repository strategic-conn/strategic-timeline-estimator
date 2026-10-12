import { test, expect } from "@playwright/test";
import { e2eName, waitForApp, collectConsoleErrors } from "./helpers";
import { cleanupE2EData } from "./cleanup";
import {
  BLANK_PROJECTS_ENABLED,
  BLANK_PROJECTS_OFF_REASON,
} from "../lib/constants/projects";

/**
 * The one suite that WRITES to the live database.
 *
 * Safety contract:
 *  - Only ever creates records named with the "[E2E]" prefix.
 *  - Never edits or deletes anything pre-existing.
 *  - Cleanup runs in afterAll even when the test fails, so a broken run can't
 *    leave litter behind.
 *
 * Desktop only: this exercises data flow, not layout, so running it three times
 * would triple the writes for no extra signal.
 */
test.describe("create a project (writes to live data)", () => {
  test.afterAll(async () => {
    const { deleted } = await cleanupE2EData();
    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    console.log(`[e2e cleanup] removed ${total} record(s):`, deleted);
  });

  test("New project is disabled, and says why, while blank projects are off", async ({ page }) => {
    test.skip(BLANK_PROJECTS_ENABLED, "blank projects are switched on");
    await page.goto("/projects");
    await waitForApp(page);
    const btn = page.getByRole("button", { name: /new project/i }).first();
    await expect(btn).toBeDisabled();
    await expect(page.locator(`[title="${BLANK_PROJECTS_OFF_REASON}"]`)).toHaveCount(1);
    // The header shortcut (shown off /projects) is gone, not just inert.
    await page.goto("/dashboard");
    await waitForApp(page);
    await expect(page.getByRole("link", { name: /^new project$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^create project$/i })).toHaveCount(0);
  });

  test("create → appears in the list → survives reload", async ({ page }, testInfo) => {
    test.skip(!BLANK_PROJECTS_ENABLED, "blank projects are switched off (BLANK_PROJECTS_ENABLED)");
    // Data-flow test, not layout — running it per viewport would triple the
    // writes to the live database for no extra signal.
    test.skip(
      testInfo.project.name !== "desktop",
      "runs once, on desktop",
    );

    const errors = collectConsoleErrors(page);
    const name = e2eName("Project");

    await page.goto("/projects");
    await waitForApp(page);

    await page.getByRole("button", { name: /new project/i }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("#project-name").fill(name);
    await dialog
      .locator("#project-description")
      .fill("Created by the automated E2E suite. Safe to delete.");
    await dialog.getByRole("button", { name: /create project/i }).click();

    await expect(dialog).toBeHidden();

    // It should appear without a manual refresh (optimistic write-through).
    await expect(
      page.getByText(name, { exact: false }).first(),
      "new project appears immediately, no reload needed",
    ).toBeVisible();

    // ...and still be there after a reload, proving it actually persisted
    // rather than only living in local state.
    await page.reload();
    await waitForApp(page);
    await expect(
      page.getByText(name, { exact: false }).first(),
      "project persisted to the database",
    ).toBeVisible();

    expect(errors, "no console errors during the flow").toEqual([]);
  });
});
