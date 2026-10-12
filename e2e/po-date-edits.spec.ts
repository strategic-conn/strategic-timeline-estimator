import { expect, test } from "@playwright/test";
import { E2E_PREFIX, env, waitForApp } from "./helpers";

async function rest(path: string, init?: RequestInit) {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", Prefer: "return=representation", ...(init?.headers ?? {}) },
  });
}

/**
 * A typed date range must not be silently replaced.
 *
 * `estimateDateRange` returns a fresh object each call, so an effect keyed on
 * that object re-fired whenever the quote's identity changed — and picking the
 * billing client writes `pbs` through the store, which does exactly that. The
 * dialog then reset dates the coordinator had typed, with nothing on screen
 * saying so, and PBS filed the PO with the derived range instead. The record has
 * no edit endpoint, so a wrong range there is permanent and invisible.
 */
test("edited dates survive changing the client", async ({ page }) => {
  const res = await rest("proposals", { method: "POST", body: JSON.stringify({
    title: `${E2E_PREFIX} date reset probe`, platform: "shopify", status: "approved",
    requirements_unclear: false, addons: {},
    line_items: [{ id: "l1", title: "Work", base_hours: 40, tier: "basic", quantity: 1, hours: 40, depends_on: [] }],
    // Create PO needs a deal; this one does not exist in Zoho (unique per run).
    zoho: { stage: "Closed Won", deal_id: `e2e-no-deal-${Date.now()}`, imported_at: new Date().toISOString() },
  })});
  if (!res.ok) { console.log("INSERT FAILED", res.status); return; }
  const id = JSON.parse(await res.text())[0].id;
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("button", { name: /create po/i }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("#po-start").waitFor();
    await expect(dlg.getByRole("button", { name: /create po|link po/i })).toBeEnabled({ timeout: 40_000 });

    await dlg.locator("#po-start").fill("2027-03-01");
    await dlg.locator("#po-end").fill("2027-09-30");
    console.log("AFTER EDIT  start:", await dlg.locator("#po-start").inputValue(), "end:", await dlg.locator("#po-end").inputValue());

    // Change the billing client — this writes pbs.client_id through the store,
    // which hands the dialog a NEW quote object.
    await dlg.locator("button[role=combobox]").first().click();
    const opts = page.getByRole("option");
    await opts.first().waitFor();
    const n = await opts.count();
    await opts.nth(n > 1 ? 1 : 0).click();
    await page.waitForTimeout(1200);

    const s = await dlg.locator("#po-start").inputValue();
    const e2 = await dlg.locator("#po-end").inputValue();
    console.log("AFTER CLIENT CHANGE  start:", s, "end:", e2);
    expect(s, "the edited start date must survive").toBe("2027-03-01");
    expect(e2, "the edited end date must survive").toBe("2027-09-30");
  } finally {
    await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
  }
});
