import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { waitForApp } from "./helpers";

/**
 * Section help — the "?" in the top-right corner of page headers and
 * sections, on the Estimator and every other page.
 *
 * ⚠️ The bug this guards: "…kind of work?</strong> It isn't…" rendered as
 * "work?It isn't". The compiler drops a space beside an inline element when
 * the neighbouring JSX text contains an HTML entity (`&apos;`), so the source
 * looked right and the page did not. Every such space is therefore written
 * as an explicit {" "} — the convention ProposalAddonsCard already documents.
 */

const SOURCES = [
  "components/features/proposals/estimator-help.tsx",
  "components/common/app-help.tsx",
];

for (const SOURCE of SOURCES) test(`source: every space beside a bold/italic word is explicit — ${SOURCE}`, () => {
  const src = readFileSync(SOURCE, "utf8");
  const after = [...src.matchAll(/<\/(?:strong|em)> (?=[^\s{<])/g)].map((m) => m.index);
  const before = [...src.matchAll(/[^\s}>] <(?:strong|em)>/g)].map((m) => m.index);
  const at = (i: number) => src.slice(Math.max(0, i - 30), i + 30).replace(/\s+/g, " ");
  expect(after.map((i) => at(i!)), "implicit space after </strong>/</em>").toEqual([]);
  expect(before.map((i) => at(i!)), "implicit space before <strong>/<em>").toEqual([]);
});

/** Open every "?" on the page in turn; check spacing and that it fits on screen. */
async function checkAllHelp(page: Page, where: string): Promise<number> {
  const buttons = page.getByRole("button", { name: /^About / });
  const n = await buttons.count();
  const vp = page.viewportSize()!;
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const name = await b.getAttribute("aria-label");
    await b.scrollIntoViewIfNeeded();
    await b.click();
    const pop = page.locator('[data-slot="popover-content"]');
    await expect(pop, `${where}: ${name} opens`).toBeVisible();
    expect(await jammed(page, '[data-slot="popover-content"]'), `${where}: ${name}`).toEqual([]);
    const box = await pop.boundingBox();
    expect(
      box!.x >= 0 && box!.y >= 0 && box!.x + box!.width <= vp.width + 1 && box!.y + box!.height <= vp.height + 1,
      `${where}: ${name} stays on screen (${JSON.stringify(box)})`,
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
  }
  return n;
}

/** Inline bold/italic words that touch the text beside them. */
async function jammed(page: Page, scope: string): Promise<string[]> {
  return page.locator(scope).evaluate((root) => {
    const bad: string[] = [];
    for (const el of root.querySelectorAll("strong, em")) {
      const prev = el.previousSibling;
      const next = el.nextSibling;
      const prevText = prev?.nodeType === Node.TEXT_NODE ? prev.textContent ?? "" : "";
      const nextText = next?.nodeType === Node.TEXT_NODE ? next.textContent ?? "" : "";
      if (prevText && !/[\s(“"]$/.test(prevText)) bad.push(`…${prevText.slice(-12)}|${el.textContent}`);
      if (nextText && !/^[\s.,;:!?)”"—–']/.test(nextText)) bad.push(`${el.textContent}|${nextText.slice(0, 12)}…`);
    }
    return bad;
  });
}

test("rendered: no bold word is glued to its neighbour, in any section", async ({ page }) => {
  test.setTimeout(120_000);

  // Negative control: the checker must catch the exact bug that was reported.
  await page.setContent(
    '<div id="probe"><p>kind of <strong>work?</strong>It isn\'t</p><p>a <strong>ok</strong> b</p></div>',
  );
  expect(await jammed(page, "#probe")).toEqual(["work?|It isn't…"]);

  await page.goto("/proposals");
  await waitForApp(page);
  let href: string | undefined;
  for (let i = 0; i < 40 && !href; i++) {
    const all = await page
      .locator('main a[href^="/proposals/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    href = all.find((h): h is string => /^\/proposals\/[^/]+$/.test(h ?? ""));
    if (!href) await page.waitForTimeout(500);
  }
  test.skip(!href, "workspace has no estimates");
  await page.goto(href!);
  await waitForApp(page);

  let opened = 0;
  for (const tab of [/^Setup$/, /^Scope & risk$/, /^Line items/, /^Adjust$/, /^Review$/]) {
    await page.getByRole("tab", { name: tab }).first().click();
    await page.waitForTimeout(400);
    const buttons = page.getByRole("button", { name: /^About / });
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      const name = await b.getAttribute("aria-label");
      await b.scrollIntoViewIfNeeded();
      await b.click();
      const pop = page.locator('[data-slot="popover-content"]');
      await expect(pop).toBeVisible();
      expect(await jammed(page, '[data-slot="popover-content"]'), `${name}`).toEqual([]);
      opened++;
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
    }
  }
  // Setup, Scope & risk, Line items, Adjust ×5, Review at the very least.
  expect(opened).toBeGreaterThanOrEqual(9);
});

test("every other page: each ? opens, reads right, and fits", async ({ page }) => {
  test.setTimeout(240_000);
  const open = async (path: string) => {
    await page.goto(path);
    await waitForApp(page);
    await page.waitForTimeout(1200);
  };
  let total = 0;
  const pages: [string, number][] = [
    ["/dashboard", 4], // header, due soon, my work, activity
    ["/projects", 1],
    ["/calendar", 3],
    ["/gantt", 1],
    ["/workload", 3], // the manager lands on the Team view
    ["/team", 3],
    ["/activity", 1],
    ["/reports", 5],
    ["/proposals", 1],
  ];
  for (const [path, min] of pages) {
    await open(path);
    const n = await checkAllHelp(page, path);
    expect(n, `${path} has its ? buttons`).toBeGreaterThanOrEqual(min);
    total += n;
  }

  // The other half of the views behind Mine/Team.
  await open("/dashboard");
  await page.getByRole("group", { name: "Scope" }).getByRole("button", { name: "Team" }).click();
  await page.waitForTimeout(800);
  total += await checkAllHelp(page, "/dashboard (Team)");
  await open("/workload");
  await page.getByRole("group", { name: "Scope" }).getByRole("button", { name: "Mine" }).click();
  await page.waitForTimeout(800);
  total += await checkAllHelp(page, "/workload (Mine)");

  // Settings, tab by tab.
  await open("/settings");
  for (const tab of ["Profile", "Skills", "Time off", "Workspace"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(400);
    total += await checkAllHelp(page, `/settings ${tab}`);
  }

  // A project and its board, when the workspace has one.
  await open("/projects");
  const grid = page.locator('[data-tour="projects.grid"] a[href^="/projects/"]').first();
  if (await grid.count()) {
    await open((await grid.getAttribute("href"))!);
    total += await checkAllHelp(page, "project");
    const sprint = page.locator('[data-tour="project.sprints"] a[href*="/sprints/"]').first();
    if (await sprint.count()) {
      await open((await sprint.getAttribute("href"))!);
      total += await checkAllHelp(page, "board");
    }
  }
  expect(total).toBeGreaterThanOrEqual(30);
});
