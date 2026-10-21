import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, openBillingStep, waitForApp } from "./helpers";

/**
 * Every project is billed (decided 2026-10-21): Start project is
 * options → review schedule → billing (the PO) → project, one button.
 * Read-only — no test presses the final button, which would raise a real PO.
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
      status: "approved",
      requirements_unclear: false,
      addons: {},
      line_items: [{ id: "l1", title: "Work", base_hours: 24, tier: "basic", quantity: 1, hours: 24, depends_on: [] }],
      ...extra,
    }),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  return (await res.json())[0].id as string;
}
const won = (tag: string) => ({
  zoho: { stage: "Closed Won", deal_id: `e2e-no-deal-${tag}-${run}`, imported_at: new Date().toISOString() },
});
const drop = (id: string) => fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });

test.beforeEach(() => test.skip(!url || !key, "needs the live database"));

test("a won estimate starts its project through the PO, and Back returns to the schedule", async ({ page }) => {
  const id = await quote("start via PO", won("a"));
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    // One button: the PO is no longer offered on its own.
    await expect(page.getByRole("button", { name: /^create po$/i })).toHaveCount(0);
    await openBillingStep(page);
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("button", { name: /create po & start project|link po .* & start project/i })).toBeVisible();
    await expect(dlg.getByText(/from the schedule you just reviewed/i)).toBeVisible({ timeout: 40_000 });
    expect(await dlg.locator("#po-start").inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await dlg.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByRole("dialog").getByText("Review the schedule")).toBeVisible();
  } finally {
    await drop(id);
  }
});

test("an estimate already billed skips the PO step", async ({ page }) => {
  const id = await quote("already billed", { ...won("b"), pbs: { po_no: `E2E-${run}` } });
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("button", { name: /^start project$/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /review schedule/i }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText(/billed as po/i)).toBeVisible();
    await expect(dlg.getByRole("button", { name: /confirm & create/i })).toBeVisible();
    await expect(dlg.getByRole("button", { name: /next: billing/i })).toHaveCount(0);
  } finally {
    await drop(id);
  }
});

test("approved without a won deal can't start a project, and says why", async ({ page }) => {
  const id = await quote("no deal", {});
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await expect(page.getByText(/start project needs a won zoho deal/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^start project$/i })).toHaveCount(0);
  } finally {
    await drop(id);
  }
});

test("the list card's Start project opens the flow on the estimate", async ({ page }) => {
  const id = await quote("from list", won("c"));
  try {
    await page.goto("/proposals");
    await waitForApp(page);
    await page.getByRole("button", { name: /^list$/i }).click(); // the view is remembered
    const card = page.locator("li").filter({ hasText: `from list ${run}` });
    await card.getByRole("link", { name: /start project/i }).click();
    await expect(page.getByRole("dialog").getByText("Start a project from this proposal")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/proposals/${id}$`));
  } finally {
    await drop(id);
  }
});
