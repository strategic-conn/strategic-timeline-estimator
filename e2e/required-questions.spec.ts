import { expect, test } from "@playwright/test";

import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { env, waitForApp } from "./helpers";

/**
 * Required questions stand out: a "Required" pill and an amber highlight until
 * answered, a per-section count under the title, and a count badge on the
 * section circles on a phone. Answering one clears its highlight.
 */
test("required questions are highlighted until answered", async ({ page }, info) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "needs the live database");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const id = (await (await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: "[E2E] required questions",
      platform: "wordpress",
      status: "draft",
      requirements_unclear: false,
      addons: {},
      line_items: [],
      discovery: { ...createEmptyDiscoveryProject(), platform: "wordpress", total_pages: null, unique_templates: null },
    }),
  })).json())[0].id as string;
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^scope/i }).click();
    await page.getByRole("button", { name: /^Section 2:/ }).click();

    await expect(page.getByText("2 required questions left in this section")).toBeVisible();
    const pages = page.locator('[data-required]').filter({ has: page.getByLabel("Total Pages") });
    await expect(pages).toHaveAttribute("data-required", "missing");
    await expect(pages.getByText("Required", { exact: true })).toBeVisible();
    await expect(page.locator("#disc-total_pages")).toHaveAttribute("aria-required", "true");
    if (info.project.name === "mobile") {
      // The section circle carries the count where there's no room for titles.
      await expect(page.getByRole("button", { name: /^Section 2:/ }).getByText("2")).toHaveCount(2);
    }

    await page.locator("#disc-total_pages").fill("12");
    await expect(pages).toHaveAttribute("data-required", "answered");
    await expect(pages.getByText("✓ Required")).toBeVisible();
    await expect(page.getByText("1 required question left in this section")).toBeVisible();
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
