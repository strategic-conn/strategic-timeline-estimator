import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * Best-fit / Fastest / Manual is chosen on the estimate's Adjust tab, before
 * the deal closes (0050). Approving freezes it with the launch date it
 * produced; Start project uses it and flags a slip against that date.
 * Never presses Create PO / Confirm — nothing external is written.
 */
const e = env();
const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function quote(label: string, extra: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: `${E2E_PREFIX} ${label} ${run}`,
      platform: "shopify",
      status: "draft",
      requirements_unclear: false,
      addons: {},
      line_items: [{ id: "l1", title: "Work", base_hours: 24, tier: "basic", quantity: 1, hours: 24, depends_on: [] }],
      ...extra,
    }),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  return (await res.json())[0].id as string;
}
const row = async (id: string) =>
  (await (await fetch(`${url}/rest/v1/proposals?id=eq.${id}&select=status,schedule_plan`, { headers: h })).json())[0];
const drop = (id: string) => fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });

test.beforeEach(({}, info) => {
  test.skip(!url || !key, "needs the live database");
  test.skip(info.project.name !== "desktop", "writes live data; runs once");
});

test("the plan is picked on Adjust, shown on the timeline, and frozen with its launch date on approval", async ({ page }) => {
  const id = await quote("plan pick", {});
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^adjust/i }).click();
    const group = page.getByRole("group", { name: "Timeline plan" });
    await expect(group.getByRole("button", { name: "Best-fit" })).toHaveAttribute("aria-pressed", "true");
    await group.getByRole("button", { name: "Fastest" }).click();
    await expect.poll(async () => (await row(id)).schedule_plan?.strategy, { timeout: 10_000 }).toBe("quick");
    await expect(page.getByTestId("plan-finish").first()).toContainText(/Launches/);

    await page.getByRole("tab", { name: /^scope/i }).click();
    await expect(page.getByText("Planned with Fastest (set on the Adjust tab).")).toBeVisible();

    // Approve by hand → the launch date is snapshotted in the same write.
    await page.locator('[data-tour="estimate.status"]').click();
    await page.getByRole("option", { name: "Approved" }).click();
    await expect.poll(async () => (await row(id)).schedule_plan?.quoted_finish ?? null, { timeout: 10_000 }).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const plan = (await row(id)).schedule_plan;
    expect(plan.strategy).toBe("quick");

    await page.getByRole("tab", { name: /^adjust/i }).click();
    await expect(group.getByRole("button", { name: "Best-fit" })).toBeDisabled();
    await expect(page.getByText(/Quoted launch: /).first()).toBeVisible();

    // Back to draft clears the snapshot; the choice stays.
    await page.locator('[data-tour="estimate.status"]').click();
    await page.getByRole("option", { name: "Draft" }).click();
    await expect.poll(async () => (await row(id)).schedule_plan?.quoted_finish ?? null, { timeout: 10_000 }).toBeNull();
    expect((await row(id)).schedule_plan.strategy).toBe("quick");
  } finally {
    await drop(id);
  }
});

test("Start project uses the quoted plan and flags a later launch", async ({ page }) => {
  const id = await quote("plan slip", {
    status: "approved",
    zoho: { stage: "Closed Won", deal_id: `e2e-no-deal-plan-${run}`, imported_at: new Date().toISOString() },
    schedule_plan: { strategy: "quick", quoted_finish: "2020-01-02", quoted_at: "2020-01-01T00:00:00Z" },
  });
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("button", { name: /^start project$/i }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByTestId("convert-plan")).toContainText("Plan: Fastest, as quoted");
    await expect(dlg.getByRole("button", { name: "Best-fit" })).toHaveCount(0);
    await dlg.getByRole("button", { name: /review schedule/i }).click();
    await expect(page.getByRole("dialog").getByText(/Quoted launch 2020-01-02 → now /)).toBeVisible();
  } finally {
    await drop(id);
  }
});
