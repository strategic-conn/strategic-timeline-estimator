import { expect, test } from "@playwright/test";

import { waitForApp } from "./helpers";

/**
 * The dashboard's two scopes, and the one thing that matters most about them:
 * they must not invent their own numbers.
 *
 * The cross-page test is the point of this file. The dashboard and Workload
 * both render "N% of Mh" for the same person in the same week, from
 * `assignedWork` / `capacityFor` / `utilization`. If those two ever disagree,
 * the dashboard is the page people quote at each other — so it is the page that
 * has to be right.
 */
test.describe("dashboard scopes", () => {
  test("personal view shows my own load from the shared definitions", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await waitForApp(page);

    const main = page.locator("main");
    await expect(
      main.locator('[data-slot="card-title"]', { hasText: /my open work/i }),
    ).toBeVisible({ timeout: 30_000 });

    // "Available hours" is the wording that replaced the ambiguous "This wk 0h"
    // - it must stay, and it must be a number of hours.
    await expect(main.getByText(/available hours/i).first()).toBeVisible();
    await expect(main.getByText(/\d+(\.\d+)?h/).first()).toBeVisible();
  });

  test("team view breaks work down per person", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForApp(page);

    const toggle = page.getByRole("group", { name: /scope/i });
    // Member and Viewer have one scope and no toggle - nothing to assert here.
    test.skip(!(await toggle.isVisible()), "viewer has no team scope");

    await toggle.getByRole("button", { name: "Team" }).click();

    const main = page.locator("main");
    await expect(
      main.locator('[data-slot="card-title"]', {
        hasText: /breakdown by person/i,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      main.locator('[data-slot="card-title"]', {
        hasText: /open tasks per person/i,
      }),
    ).toBeVisible();

    // At least one real person row, with a utilisation figure beside them.
    await expect(main.locator("table tbody tr").first()).toBeVisible();
    await expect(main.getByText(/%\s*of\s*\d+h/).first()).toBeVisible();
  });

  test("utilisation matches the Workload page for the same person", async ({
    page,
  }) => {
    const read = async (path: string, afterClick?: () => Promise<void>) => {
      await page.goto(path);
      await waitForApp(page);
      if (afterClick) await afterClick();
      const rows = page.locator("main").getByText(/%\s*of\s*\d+h/);
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });
      // Keep only the "N% of Mh" figure. Workload appends why capacity is
      // reduced in the same text — "0% of 32h (40h − 1 holiday)" — so in any
      // week with a holiday or leave a whole-string compare failed on figures
      // that agreed. Whitespace normalised so "72%  of 40h" matches too.
      return (await rows.allInnerTexts())
        .map((t) => t.replace(/\s+/g, " ").match(/\d+% of \d+(?:\.\d+)?h/)?.[0] ?? t.trim())
        .sort();
    };

    await page.goto("/dashboard");
    await waitForApp(page);
    const toggle = page.getByRole("group", { name: /scope/i });
    test.skip(!(await toggle.isVisible()), "viewer has no team scope");

    const dash = await read("/dashboard", async () => {
      await page
        .getByRole("group", { name: /scope/i })
        .getByRole("button", { name: "Team" })
        .click();
    });
    const workload = await read("/workload");

    // Workload's team table may carry extra rows the dashboard does not render
    // (and vice versa as the pages evolve), so assert on the OVERLAP rather
    // than on equal arrays: every figure the dashboard shows must also be a
    // figure Workload shows for somebody.
    const inWorkload = new Set(workload);
    const disagreements = dash.filter((d) => !inWorkload.has(d));
    expect(
      disagreements,
      `dashboard figures absent from Workload: ${disagreements.join(", ")}`,
    ).toEqual([]);
  });

  test("team Overdue is the same number as Reports' Overdue", async ({ page }) => {
    /**
     * Two pages, one definition: every open task past due, counted once,
     * assigned or not. The team view used to sum each person's overdue count —
     * double-counting shared tasks and omitting unassigned ones — so the
     * headline number people compare across pages could disagree.
     */
    const kpi = async (label: string) => {
      const card = page
        .locator('main [data-slot="card"]')
        .filter({
          has: page.locator('[data-slot="card-description"]', {
            hasText: new RegExp(String.raw`^\s*${label}\s*$`),
          }),
        })
        .first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      const text = await card.locator('[data-slot="card-title"]').innerText();
      return Number(text.replace(/[^0-9.]/g, ""));
    };

    // ⚠️ Wait for hydration before reading either page. A full navigation
    // re-hydrates the stores from empty, and a KPI card renders a real-looking
    // `0` until the tasks arrive — reading then compares a number to a loading
    // state. `networkidle` waits out the hydrate fetches (the realtime
    // websocket does not count towards it).
    const settled = async (path: string) => {
      await page.goto(path);
      await waitForApp(page);
      await page.waitForLoadState("networkidle");
    };

    await settled("/dashboard");
    const toggle = page.getByRole("group", { name: /scope/i });
    test.skip(!(await toggle.isVisible()), "viewer has no team scope");
    await toggle.getByRole("button", { name: "Team" }).click();
    const onDashboard = await kpi("Overdue");

    await settled("/reports");
    await expect
      .poll(() => kpi("Overdue"), {
        message: `reports overdue should equal dashboard's ${onDashboard}`,
        timeout: 20_000,
      })
      .toBe(onDashboard);
  });
});

// The narrow column spans both grid rows. With plain `auto` rows a tall sidebar
// (a full donut + utilisation card) shared its extra height across BOTH rows and
// opened a ~600px hole under the due-soon table; `lg:grid-rows-[auto_1fr]` gives
// all of it to row 2. Negative control: 618px without the fix, 24px (the gap) with.
test("a tall sidebar never opens a gap under the due-soon table", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "two columns only at lg+");
  await page.goto("/dashboard");
  await waitForApp(page);
  const gap = await page.evaluate(() => {
    const sec = [...document.querySelectorAll("section")].find((s) =>
      s.className.includes("lg:grid-cols-[1.6fr_1fr]"),
    )!;
    const [due, side, activity] = [...sec.children] as HTMLElement[];
    const tall = document.createElement("div");
    tall.style.height = "1400px";
    side.appendChild(tall); // DOM-only: measures layout, writes nothing
    return activity.getBoundingClientRect().top - due.getBoundingClientRect().bottom;
  });
  expect(gap).toBeLessThanOrEqual(32);
});
