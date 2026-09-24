import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * A catalog estimate's timeline, scheduled by role (pricing plan Phase 5).
 *
 * A throwaway "[E2E]" estimate with no questionnaire: an IT line and a Creative
 * line. The Scope & risk tab's Gantt must draw a Design & UX bar for the
 * Creative work — and, as the negative control, no Design bar once that line is
 * back on IT. Created and deleted here.
 */
test("a Creative catalog line draws a Design bar on the timeline", async ({ page }) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const line = (id: string, title: string, hours: number, responsible: string) => ({
    id,
    title,
    module: "Homepage - Standard",
    category_id: null,
    catalog_id: null,
    base_hours: hours,
    tier: "basic",
    quantity: 1,
    hours,
    depends_on: [],
    responsible,
    level: 1,
    rate: 100,
  });
  const addons = {
    pm_enabled: false,
    pm_basis: "simple",
    pm_pct: 10,
    responsive_enabled: false,
    responsive_pct: 25,
    design_enabled: false,
    design_pct: 35,
    qa_enabled: false,
    qa_pct: 20,
  };
  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const made = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: `${E2E_PREFIX} role phases ${run}`,
      platform: "wordpress",
      line_items: [line("l1", "Homepage build", 40, "IT"), line("l2", "Custom icons", 16, "Creative")],
      addons,
    }),
  });
  const id = (await made.json())?.[0]?.id;
  expect(id, "fixture estimate").toBeTruthy();

  try {
    const gantt = async () => {
      await page.goto(`/proposals/${id}`);
      await waitForApp(page);
      await page.getByRole("tab", { name: /scope & risk/i }).click();
      const g = page.getByRole("img", { name: "Gantt chart of project phases" }).or(
        page.getByLabel("Gantt chart of project phases"),
      );
      await expect(g.first()).toBeVisible({ timeout: 15_000 });
      return g.first();
    };

    const g = await gantt();
    await expect(g).toContainText("Design & UX");
    await expect(g).toContainText("Development");
    expect(await hasHorizontalScroll(page)).toBe(false);

    // Negative control: the same work done by IT has no Design phase.
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({
        line_items: [line("l1", "Homepage build", 40, "IT"), line("l2", "Custom icons", 16, "IT")],
      }),
    });
    const g2 = await gantt();
    await expect(g2).toContainText("Development");
    await expect(g2).not.toContainText("Design & UX");
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
