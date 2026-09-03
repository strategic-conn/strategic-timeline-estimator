import { expect, test } from "@playwright/test";

/**
 * Project-scoped routes, and the card layout that holds their titles.
 *
 * Read-only: it visits a project that does not exist, and measures the real
 * project's cards. Nothing is created, edited or deleted — the write path is
 * `create-project.spec.ts`, which cleans up after itself.
 */

const GONE = "00000000-0000-0000-0000-000000000000";

test.describe("a project that isn't there", () => {
  /**
   * Every one of these is reachable without typing a URL: deleting a project
   * writes an activity entry pointing at its own overview page, so the feed is
   * full of links to projects that no longer exist. They used to render as
   * working pages — the overview offered "New sprint", the backlog offered
   * "Add task" — and both inserts can only fail against a deleted foreign key.
   */
  for (const suffix of ["", "/sprints", "/backlog", "/activity", "/tasks"]) {
    test(`/projects/<gone>${suffix || "/"} says so`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.goto(`/projects/${GONE}${suffix}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2200);

      const main = await page.locator("main").innerText();
      expect(main, "must show the not-found state").toContain(
        "This project no longer exists",
      );
      // Nothing that would try to insert against the missing project.
      const creates = await page
        .locator("main")
        .getByRole("button", { name: /New sprint|Create sprint|Add task|New task/i })
        .count();
      expect(creates, "must not offer to create children").toBe(0);
      expect(errors).toEqual([]);
    });
  }

  test("a malformed id is handled the same way", async ({ page }) => {
    await page.goto("/projects/not-a-uuid");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2200);
    expect(await page.locator("main").innerText()).toContain(
      "This project no longer exists",
    );
  });
});

test.describe("the shared components still serve their other callers", () => {
  // ProjectNotFound is wired into TasksPage and ActivityFeedClient, both of
  // which also render WITHOUT a project in scope. Guarding wrongly would break
  // the global feed and every sprint board.
  test("the global activity feed is unaffected", async ({ page }) => {
    await page.goto("/activity");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2200);
    expect(await page.locator("main").innerText()).not.toContain(
      "This project no longer exists",
    );
  });

  test("a real project's pages still render", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2200);
    const href = await page
      .locator('a[href^="/projects/"]')
      .first()
      .getAttribute("href");
    test.skip(!href, "no projects in this workspace to check against");
    const id = href!.split("/")[2];

    for (const suffix of ["", "/backlog", "/activity"]) {
      await page.goto(`/projects/${id}${suffix}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2600);
      expect(
        await page.locator("main").innerText(),
        `/projects/<real>${suffix} must render normally`,
      ).not.toContain("This project no longer exists");
    }
  });
});

test("a long card title can't push its actions off-screen", async ({ page }) => {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2400);

  const menu = page.getByRole("button", { name: "Project actions" }).first();
  test.skip(!(await menu.count()), "no project cards to measure");
  const vw = page.viewportSize()!.width;
  const box = await menu.boundingBox();
  expect(
    box!.x + box!.width,
    "the actions menu must stay inside the viewport",
  ).toBeLessThanOrEqual(vw);

  /**
   * The mechanism, not just today's data: `CardHeader` is a grid, and a grid
   * item defaults to `min-width: auto` — so without `min-w-0` on the header row
   * a long title refuses to shrink and shoves the menu out of reach. Rewriting
   * the rendered text is enough to prove it; nothing is persisted.
   */
  const rows = await page.evaluate(() => {
    const long =
      "A Deliberately Very Long Project Name For The Complete Website Rebuild Programme";
    const out: string[] = [];
    for (const t of Array.from(document.querySelectorAll('[data-slot="card-title"]')).slice(0, 4)) {
      const header = t.closest('[data-slot="card-header"]') as HTMLElement | null;
      const row = header?.firstElementChild as HTMLElement | null;
      if (!header || !row) continue;
      const prev = t.textContent;
      t.textContent = long;
      out.push(`${Math.round(row.getBoundingClientRect().width)}/${header.clientWidth}`);
      t.textContent = prev;
    }
    return out;
  });
  for (const r of rows) {
    const [w, avail] = r.split("/").map(Number);
    expect(w, `header row ${r} must fit`).toBeLessThanOrEqual(avail + 1);
  }
});
