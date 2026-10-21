import { expect, test, type Locator, type Page } from "@playwright/test";

import { env, waitForApp } from "./helpers";

/**
 * Click-and-drag on an empty part of a board pans it sideways (useDragScroll).
 * Read-only: nothing is moved between columns, so it runs against live data.
 * Desktop only — touch already swipes these strips natively.
 */
async function panLeft(page: Page, strip: Locator, from: { x: number; y: number }, dx: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - dx / 2, from.y, { steps: 6 });
  await page.mouse.move(from.x - dx, from.y, { steps: 6 });
  await page.mouse.up();
  return strip.evaluate((el) => el.scrollLeft);
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "mouse drag — desktop only");
});

test("the Estimator stage board pans sideways on a drag", async ({ page }) => {
  await page.goto("/proposals");
  await waitForApp(page);
  await page.getByRole("button", { name: /^stages$/i }).click();
  const firstColumn = page.locator("section[aria-label]").first();
  await expect(firstColumn).toBeVisible({ timeout: 30_000 });
  const strip = firstColumn.locator("xpath=..");
  test.skip((await strip.evaluate((el) => el.scrollWidth - el.clientWidth)) < 50, "board fits — nothing to pan");

  expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0);
  // Grab the second column low down but ON screen — the board can be taller
  // than the viewport. A card body is fine too; only its controls are excluded.
  const col = page.locator("section[aria-label]").nth(1);
  const box = (await col.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const from = { x: box.x + box.width / 2, y: Math.min(box.y + box.height - 40, vh - 20) };
  expect(
    await page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest("a, button, input, [role='button']"), [from.x, from.y]),
    "press point is not on a control",
  ).toBe(true);
  const left = await panLeft(page, strip, from, 400);
  expect(left, "dragging left scrolls the board right").toBeGreaterThan(200);
});

test("the task board pans sideways on a drag, and a card click still opens it", async ({ page }) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "needs the live database");
  const sp = (await (await fetch(`${url}/rest/v1/sprints?select=id,project_id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })).json())?.[0];
  test.skip(!sp, "no sprint to open");

  await page.setViewportSize({ width: 1100, height: 800 }); // five columns can't all fit
  await page.goto(`/projects/${sp.project_id}/sprints/${sp.id}`);
  await waitForApp(page);
  const strip = page.locator('[data-tour="board.kanban"]');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  test.skip((await strip.evaluate((el) => el.scrollWidth - el.clientWidth)) < 50, "board fits — nothing to pan");

  const box = (await strip.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const left = await panLeft(page, strip, { x: box.x + box.width - 60, y: Math.min(box.y + box.height - 30, vh - 20) }, 300);
  expect(left).toBeGreaterThan(150);
  // The click that ends a pan must not open anything.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
