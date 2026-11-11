import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * Two things a coordinator acts on without being able to check them elsewhere:
 * an estimate names ONE launch date, and Sync schedule's preview names the new
 * task even when it lands in a sprint the project already has.
 * Never presses Confirm. Everything it makes is deleted in teardown.
 */
const e = env();
const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const post = async (table: string, body: unknown) => {
  const r = await fetch(`${url}/rest/v1/${table}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const text = await r.text();
  expect(r.ok, text).toBe(true);
  return JSON.parse(text)[0];
};
const drop = (table: string, id: string) => fetch(`${url}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: h });
const line = (id: string, title: string) => ({
  id, title, base_hours: 8, tier: "basic", quantity: 1, hours: 8, depends_on: [], responsible: "IT", level: 1, rate: 100,
});

test.beforeEach(({}, info) => {
  test.skip(!url || !key, "needs the live database");
  test.skip(info.project.name !== "desktop", "writes live data; runs once");
});

test("a guided estimate's summary, card and planned timeline name one launch date", async ({ page }) => {
  const q = await post("proposals", {
    title: `${E2E_PREFIX} one launch ${run}`,
    platform: "wordpress", status: "draft", requirements_unclear: false, addons: {},
    line_items: [line("l1", "Build")],
    discovery: { platform: "wordpress", total_pages: 6, unique_templates: 2, client_review_turnaround: 1, skipped_sections: [4, 5, 6, 8] },
  });
  try {
    await page.goto(`/proposals/${q.id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^adjust/i }).click();
    const card = await page.getByTestId("plan-finish").first().innerText();
    const launch = card.match(/Launches\s+([A-Z][a-z]{2} \d{1,2}, \d{4})/)?.[1];
    expect(launch, card).toBeTruthy();

    await page.getByRole("tab", { name: /^scope/i }).click();
    await expect(page.getByTestId("summary-launch")).toHaveText(launch!);
    await page.getByRole("tab", { name: /^review/i }).click();
    await page.getByRole("tab", { name: /^timeline/i }).click();
    // The task-level chart (same component as the project page). Its last bar
    // ends on the launch day, and the 10% default buffer is striped on
    // Development work.
    await expect(page.getByText("Planned schedule")).toBeVisible();
    // Bars carry their hover card as an aria-label ("… Ends Mon, Dec 7, 2026 …")
    // since the hover-card change replaced the old `title` tooltips.
    const ends = await page.locator('[aria-label*="Ends "]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label") ?? ""),
    );
    expect(ends.some((t) => t.includes(`Ends `) && t.includes(`, ${launch}`)), ends.join(" | ")).toBe(true);
    expect(await page.getByTestId("gantt-buffer").count()).toBeGreaterThan(0);
  } finally {
    await drop("proposals", q.id);
  }
});

test("Sync schedule's preview names a new task landing in an existing sprint", async ({ page }) => {
  const owner = (await (await fetch(`${url}/rest/v1/profiles?email=eq.${encodeURIComponent(e.E2E_EMAIL)}&select=id`, { headers: h })).json())[0].id;
  const today = new Date().toISOString().slice(0, 10);
  const project = await post("projects", { name: `${E2E_PREFIX} sync preview ${run}`, owner_id: owner });
  await post("sprints", { project_id: project.id, name: "Development", start_date: today, end_date: today });
  const q = await post("proposals", {
    title: `${E2E_PREFIX} sync preview ${run}`,
    platform: "wordpress", status: "approved", requirements_unclear: false, addons: {},
    project_id: project.id,
    line_items: [line("l1", "Brand new line")],
  });
  try {
    await page.goto(`/projects/${project.id}`);
    await waitForApp(page);
    await page.getByRole("button", { name: /sync schedule/i }).first().click();
    await page.getByRole("menuitem", { name: /best-fit/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Brand new line")).toBeVisible();
    await expect(dialog.getByText("Development")).toBeVisible();
    await expect(dialog.getByText("Existing sprint")).toBeVisible();
    await expect(dialog.getByText("0 sprints")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await drop("proposals", q.id);
    await drop("projects", project.id);
  }
});
