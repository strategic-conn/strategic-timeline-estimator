import { expect, test } from "@playwright/test";

import { hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The pending / overdue badges open the list behind them.
 *
 * They used to be dead ends: a manager was told a problem existed and then had
 * to go hunting for which tasks. Runs at all three widths — the panel is a
 * control, not a hover hint, precisely so it works on a phone.
 */
test.describe("workload count badges", () => {
  test("a badge opens its task list, and each row links to that task", async ({
    page,
  }) => {
    await page.goto("/workload");
    await waitForApp(page);
    // ⚠️ Wait for the roster to HYDRATE before counting. `count()` resolves
    // immediately — it does not retry — so checking straight after
    // `waitForApp` found zero badges every time and skipped the whole spec.
    await expect(page.getByText(/Load by person/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main").getByText(/% of \d+h/).first()).toBeVisible({
      timeout: 30_000,
    });

    // Team is the default for an approver; the badges live on its cards.
    const badge = page
      .getByRole("button", { name: /\d+ (pending|overdue) — show which tasks/i })
      .first();
    test.skip(
      (await badge.count()) === 0,
      "nobody currently has pending or overdue work",
    );
    await expect(badge).toBeVisible({ timeout: 30_000 });
    // The accessible name carries the count, so the badge says what it opens
    // before it is opened.
    const name = (await badge.getAttribute("aria-label")) ?? "";
    const expected = Number(name.match(/^(\d+)/)?.[1] ?? 0);
    expect(expected).toBeGreaterThan(0);

    await badge.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Exactly as many rows as the badge claimed — a count that disagrees with
    // its own list is worse than no list at all.
    const rows = panel.getByRole("link");
    await expect(rows).toHaveCount(expected);

    // Every row goes to a real board, with the task pre-selected.
    const href = await rows.first().getAttribute("href");
    expect(href, href ?? "").toMatch(/\/projects\/[^/]+\/(sprints\/[^/]+|backlog)/);

    await rows.first().click();
    await page.waitForURL(/\/projects\//, { timeout: 30_000 });
    await waitForApp(page);
    expect(await hasHorizontalScroll(page), "task board scrolls sideways").toBe(
      false,
    );
  });

  test("the panel stays inside the viewport", async ({ page }) => {
    await page.goto("/workload");
    await waitForApp(page);
    await expect(page.locator("main").getByText(/% of \d+h/).first()).toBeVisible({
      timeout: 30_000,
    });

    const badge = page
      .getByRole("button", { name: /\d+ (pending|overdue) — show which tasks/i })
      .first();
    test.skip((await badge.count()) === 0, "no badge to open");
    await badge.click();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // At 375px a default-width popover would hang off the edge — the content is
    // capped at `min(20rem, 100vw - 2rem)` for exactly this.
    const fits = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= window.innerWidth + 1;
    });
    expect(fits, "popover overflows the viewport").toBe(true);
    expect(await hasHorizontalScroll(page), "page scrolls sideways").toBe(false);
  });
});
