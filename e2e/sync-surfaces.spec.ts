import { expect, test } from "@playwright/test";

import { collectConsoleErrors, env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The two-way sync's own surfaces, at every width.
 *
 * `page-header-fit.spec.ts` sweeps the top-level pages, but the estimate editor
 * (`/proposals/[id]`) and a project's page (`/projects/[id]`) were never in that
 * list — and between them they hold every piece of UI the sync added: the PO
 * badge with its "· dates changed" note, the Timeline tab that now renders the
 * live project Gantt, and the schedule preview's "Existing tasks" block.
 *
 * Read-only. Resolves a real linked estimate at runtime rather than hardcoding
 * an id, which is how two guards in this suite once rotted into passing
 * vacuously.
 */
async function rest(path: string) {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.ok ? res.json() : null;
}

/** An estimate that has become a project — the only state the sync UI exists in. */
async function quoteWithProject(): Promise<{
  quoteId: string;
  projectId: string;
  poNo: string | null;
} | null> {
  const rows = (await rest(
    "proposals?select=id,project_id,pbs&project_id=not.is.null&limit=1",
  )) as { id: string; project_id: string; pbs: { po_no?: string } | null }[] | null;
  const row = rows?.[0];
  return row
    ? { quoteId: row.id, projectId: row.project_id, poNo: row.pbs?.po_no ?? null }
    : null;
}

test.describe("sync surfaces fit and work at every width", () => {
  test("the estimate editor's header never clips its own controls", async ({ page }) => {
    const found = await quoteWithProject();
    test.skip(!found, "no estimate has been started as a project yet");

    const errors = collectConsoleErrors(page);
    await page.goto(`/proposals/${found!.quoteId}`);
    await waitForApp(page);
    // Every line-item group card is also a <header>, so scope to the page's own
    // — and wait for the store to hydrate, or there is nothing here to measure.
    await expect(page.getByRole("tab", { name: /setup/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    const clipped = await page.evaluate(() => {
      const hdr = document.querySelector("main header");
      if (!hdr) return ["no page header"];
      const h = hdr.getBoundingClientRect();
      const out: string[] = [];
      // The same interactive set the page sweep uses, plus the PO badge — a
      // <span>, and the thing that grew a suffix. Not every span: text inside a
      // `truncate` box legitimately overflows its own parent.
      hdr
        .querySelectorAll('button, a[href], input, select, [title^="Purchase order"]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.x + r.width > h.x + h.width + 1 || r.x < h.x - 1) {
            out.push((el.textContent ?? "").trim().slice(0, 30) || "(icon)");
          }
        });
      return out;
    });
    expect(clipped, clipped.join(" | ")).toEqual([]);
    expect(await hasHorizontalScroll(page), "editor scrolls sideways").toBe(false);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("a project's page fits its controls and does not scroll sideways", async ({
    page,
  }) => {
    const found = await quoteWithProject();
    test.skip(!found, "no estimate has been started as a project yet");

    await page.goto(`/projects/${found!.projectId}`);
    await waitForApp(page);
    // The embedded Gantt is the wide thing here; it must own its own scroller
    // rather than pushing the document sideways.
    await expect(page.locator("main header")).toBeVisible({ timeout: 30_000 });
    expect(await hasHorizontalScroll(page), "project page scrolls sideways").toBe(false);
  });

  test("a linked estimate's Timeline tab shows the LIVE project Gantt", async ({
    page,
  }) => {
    const found = await quoteWithProject();
    test.skip(!found, "no estimate has been started as a project yet");

    await page.goto(`/proposals/${found!.quoteId}`);
    await waitForApp(page);

    // Scope & risk → Timeline. Both tab strips wrap rather than scroll, so every
    // trigger is reachable at 375px too. The inner strip only exists once the
    // outer tab's content is mounted, which is why each step is awaited.
    const scope = page.getByRole("tab", { name: /scope/i }).first();
    await expect(scope).toBeVisible({ timeout: 30_000 });
    await scope.click();
    const timeline = page.getByRole("tab", { name: /^timeline$/i }).first();
    await expect(timeline).toBeVisible({ timeout: 30_000 });
    await timeline.click();

    // The live-project banner replaces the "Tentative timeline" one. Asserting
    // the tentative copy is GONE is the real check: drawing both is exactly how
    // the estimate and the project came to disagree.
    await expect(page.getByText(/live project timeline/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/tentative timeline/i)).toHaveCount(0);
    expect(await hasHorizontalScroll(page), "timeline tab scrolls the page").toBe(false);
  });

  test("the PO badge reports schedule drift when the project has moved", async ({
    page,
  }) => {
    const found = await quoteWithProject();
    test.skip(!found?.poNo, "the linked estimate has no purchase order");

    const [po] = (await rest(
      `proposals?select=pbs&id=eq.${found!.quoteId}`,
    )) as { pbs: { start_date?: string; end_date?: string } }[];
    const sprints = (await rest(
      `sprints?select=start_date,end_date&project_id=eq.${found!.projectId}`,
    )) as { start_date: string; end_date: string }[];
    test.skip(!po?.pbs?.start_date || !sprints?.length, "nothing to compare");

    const start = sprints.map((s) => s.start_date).sort()[0];
    const end = sprints.map((s) => s.end_date).sort().at(-1);
    const drifted = start !== po.pbs.start_date || end !== po.pbs.end_date;

    await page.goto(`/proposals/${found!.quoteId}`);
    await waitForApp(page);
    const badge = page.getByTitle(new RegExp(`Purchase order ${found!.poNo}`)).first();
    await expect(badge).toBeVisible({ timeout: 30_000 });

    // The badge must agree with the data, in BOTH directions — a note that is
    // always on says as little as one that is never on.
    await expect(badge).toContainText(drifted ? /dates changed/i : /PO/i);
    if (!drifted) await expect(badge).not.toContainText(/dates changed/i);
  });
});
