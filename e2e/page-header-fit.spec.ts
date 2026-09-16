import { expect, test } from "@playwright/test";

import { hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * Page headers must fit their own controls, at every width.
 *
 * `WorkspacePageHeader` is `overflow-hidden`, so a control that does not fit is
 * not merely cramped — it is invisible, with no scrollbar to hint at it. The
 * Estimator shipped exactly that: five controls needing ~611px inside a 576px
 * cap, with **New estimate** sliced off the right edge, and a page capped at
 * `max-w-3xl` that starved the title to 85px inside a 1600px shell so the
 * description wrapped one word per line.
 *
 * Runs under all three viewport projects, so one pass covers 375 / 768 / 1280.
 */
const PAGES = [
  "/dashboard",
  "/projects",
  "/proposals",
  "/activity",
  "/calendar",
  "/gantt",
  "/workload",
  "/reports",
  "/team",
  "/settings",
];

test("no page header clips its own controls", async ({ page }) => {
  const failures: string[] = [];

  for (const path of PAGES) {
    await page.goto(path);
    await waitForApp(page);

    const clipped = await page.evaluate(() => {
      const hdr = document.querySelector("main header");
      if (!hdr) return [] as string[];
      const h = hdr.getBoundingClientRect();
      const out: string[] = [];
      hdr.querySelectorAll("button, a[href], input, select").forEach((el) => {
        const r = el.getBoundingClientRect();
        // Hidden controls have no box; only laid-out ones can be clipped.
        if (r.width === 0 || r.height === 0) return;
        if (r.x + r.width > h.x + h.width + 1 || r.x < h.x - 1) {
          out.push((el.textContent ?? "").trim().slice(0, 24) || "(icon)");
        }
      });
      return out;
    });
    if (clipped.length) failures.push(`${path}: ${clipped.join(", ")}`);

    // A page that scrolls sideways hides content behind an invisible overlay
    // scrollbar. Wide content gets its OWN scroller (Gantt, the stage board).
    if (await hasHorizontalScroll(page)) failures.push(`${path}: page scrolls sideways`);
  }

  expect(failures, failures.join(" | ")).toEqual([]);
});

test("the Estimator gives the board the shell and the cards a reading width", async ({
  page,
}) => {
  await page.goto("/proposals");
  await waitForApp(page);

  const shell = await page.evaluate(
    () => Math.round(document.querySelector("main > div")!.getBoundingClientRect().width),
  );

  // Stages is the default view now, so switch to List explicitly — otherwise
  // `main ul` is absent and the reading-width assertion below silently passes
  // without ever checking anything.
  await page.getByRole("button", { name: /^list$/i }).click();
  await expect(page.locator("main ul")).toBeVisible({ timeout: 30_000 });

  // List: the header takes the whole shell (so its controls fit) while the card
  // column stays a comfortable column. Capping the PAGE is what broke the
  // header, so the cap belongs here and only here.
  const list = await page.evaluate(() => {
    const ul = document.querySelector("main ul");
    const hdr = document.querySelector("main header");
    return {
      ul: ul ? Math.round(ul.getBoundingClientRect().width) : null,
      header: hdr ? Math.round(hdr.getBoundingClientRect().width) : null,
    };
  });
  expect(list.header).toBe(shell);
  expect(list.ul, "the list must be rendered to be measured").not.toBeNull();
  if (shell > 800) {
    expect(list.ul, "cards keep a reading width on a wide screen").toBeLessThanOrEqual(
      800,
    );
  }

  // Board: takes the shell, because eleven columns are not prose.
  await page.getByRole("button", { name: /^stages$/i }).click();
  await expect(page.locator("section[aria-label] h3").first()).toBeVisible({
    timeout: 30_000,
  });
  const strip = await page.evaluate(() => {
    const el = document.querySelector("section[aria-label]")!.parentElement!;
    return { width: Math.round(el.getBoundingClientRect().width), scroll: el.scrollWidth };
  });
  // Within the 8px of negative margin the strip uses to bleed into the gutter.
  expect(Math.abs(strip.width - shell)).toBeLessThanOrEqual(10);
  expect(strip.scroll, "columns overflow into the strip's own scroller").toBeGreaterThan(
    strip.width,
  );
});
