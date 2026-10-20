import { expect, test } from "@playwright/test";

import { env, waitForApp } from "./helpers";

/**
 * Settings → Workspace → Holidays: a manager sees the list read-only; an admin
 * can mark a holiday as a working day and back. Desktop only — it writes.
 *
 * Touches the LIVE `holiday_settings` table for a few seconds (Veterans Day),
 * so the row is removed in `finally`: the workspace ends exactly as it started.
 */
const HOLIDAY = "Veterans Day";

test("managers read holidays; an admin marks one as a working day and back", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "writes live data; runs once");
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rowFor = async () =>
    (await (await fetch(`${url}/rest/v1/holiday_settings?name=eq.${encodeURIComponent(HOLIDAY)}&select=working`, { headers: h })).json())?.[0];
  test.skip((await rowFor()) !== undefined, `${HOLIDAY} already has a setting — not touching it`);

  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-holadmin-${run}@example.test`;
  const password = `P-${run}-x9!`;
  let adminId: string | null = null;
  try {
    // ── Manager (the suite's bot): the list, read-only. ──
    await page.goto("/settings?tab=workspace");
    await waitForApp(page);
    const card = page.locator("[data-slot=card]").filter({ hasText: "Holidays" }).filter({ hasText: HOLIDAY });
    await expect(card.getByText("Only admins can change holidays.")).toBeVisible();
    await expect(card.getByRole("listitem")).toHaveCount(11);
    await expect(card.getByRole("button", { name: "Working" })).toHaveCount(0);

    // ── Admin: a throwaway account in a fresh, signed-out context. ──
    await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
      method: "POST",
      headers: { ...h, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ email, role: "admin" }]),
    });
    const u = await (await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST", headers: h, body: JSON.stringify({ email, password, email_confirm: true }),
    })).json();
    adminId = u.id;
    await fetch(`${url}/rest/v1/profiles?id=eq.${adminId}`, {
      method: "PATCH", headers: h,
      body: JSON.stringify({ name: `[E2E] holidays ${run}`, role: "admin", confirmed_at: "2026-01-01T00:00:00Z" }),
    });

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const ap = await ctx.newPage();
    await ap.goto("/login");
    await ap.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
    }, { timeout: 30_000 });
    await ap.locator("#email").fill(email);
    await ap.locator("#password").fill(password);
    await ap.getByRole("button", { name: /sign in/i }).click();
    await ap.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await ap.goto("/settings?tab=workspace");
    await waitForApp(ap);

    const row = ap.locator("li").filter({ hasText: HOLIDAY });
    await row.getByRole("button", { name: "Working" }).click();
    await expect(row.getByRole("button", { name: "Working" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await rowFor())?.working, { timeout: 10_000 }).toBe(true);

    await row.getByRole("button", { name: "Day off" }).click();
    await expect.poll(async () => (await rowFor())?.working, { timeout: 10_000 }).toBe(false);
    await ctx.close();
  } finally {
    await fetch(`${url}/rest/v1/holiday_settings?name=eq.${encodeURIComponent(HOLIDAY)}`, { method: "DELETE", headers: h });
    if (adminId) await fetch(`${url}/auth/v1/admin/users/${adminId}`, { method: "DELETE", headers: h });
    await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: h });
  }
});
