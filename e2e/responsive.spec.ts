import { test, expect } from "@playwright/test";
import { waitForApp, hasHorizontalScroll } from "./helpers";

/**
 * Locks in the three layout tiers. These were previously verified only by
 * reading the CSS, so this is the first real guard on them.
 *
 *   < 768   bottom tab bar, no sidebar
 *   768–1023 64px icon rail (icons only, no labels)
 *   >= 1024 full sidebar with labels
 *
 * Read-only.
 */

const SIDEBAR = "aside";

test.describe("layout tiers", () => {
  test("sidebar/tab-bar match the viewport", async ({ page }, testInfo) => {
    await page.goto("/dashboard");
    await waitForApp(page);

    const project = testInfo.project.name;
    const aside = page.locator(SIDEBAR).first();
    // The bottom tab bar is the only <nav> that is fixed to the bottom.
    const tabBar = page.locator("nav.fixed.inset-x-0.bottom-0");

    if (project === "mobile") {
      await expect(aside, "no sidebar below 768px").toBeHidden();
      await expect(tabBar, "bottom tab bar shows on mobile").toBeVisible();
      return;
    }

    // Tablet and desktop both show the sidebar, and neither shows the tab bar.
    await expect(aside, "sidebar visible at >=768px").toBeVisible();
    await expect(tabBar, "tab bar hidden at >=768px").toBeHidden();

    const width = (await aside.boundingBox())?.width ?? 0;
    // innerText returns only *rendered* text, so hidden labels don't count.
    // (Checking the link itself wouldn't work: on the rail it's still visible —
    // it's the icon — and keeps its accessible name via the title tooltip.)
    const visibleText = await aside.innerText();

    if (project === "tablet") {
      // 64px rail (w-16), plus a little slack for borders.
      expect(width, `icon rail should be ~64px, got ${width}`).toBeLessThan(90);
      expect(
        visibleText,
        "the rail shows icons only — no text labels",
      ).not.toMatch(/Projects|Dashboard|Workspace/);
      // The icon must still be reachable and named for assistive tech.
      await expect(page.getByRole("link", { name: /^Projects$/ })).toBeVisible();
    } else {
      expect(width, `full sidebar should be >=200px, got ${width}`).toBeGreaterThan(200);
      expect(visibleText, "desktop sidebar shows text labels").toMatch(/Projects/);
    }
  });

  test("calendar keeps the month grid usable", async ({ page }, testInfo) => {
    await page.goto("/calendar");
    await waitForApp(page);
    expect(await hasHorizontalScroll(page)).toBe(false);

    // The day-detail panel must stack BELOW the month until xl, otherwise a
    // 320px panel squeezes the 7 day-columns (this was a real bug at 1024px).
    const dayCells = page.locator(".grid-cols-7 > button");
    const count = await dayCells.count();
    expect(count, "month grid renders day cells").toBeGreaterThan(27);

    const cell = await dayCells.first().boundingBox();
    const minWidth = testInfo.project.name === "mobile" ? 35 : 70;
    expect(
      cell?.width ?? 0,
      `day cells should be >=${minWidth}px wide, got ${cell?.width}`,
    ).toBeGreaterThan(minWidth);
  });

  test("timeline gives the chart real width", async ({ page }) => {
    await page.goto("/gantt");
    await waitForApp(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
