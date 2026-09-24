import { expect, test, type Page } from "@playwright/test";

import { env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * Team → a member's "Work keys & skills" dialog (pricing plan Phase 4).
 *
 * Two throwaway "[E2E]" accounts, created and deleted here: a member whose keys
 * are edited, and an ADMIN who does the editing (the suite's own bot is a
 * manager, and managers may only read keys). No real person's keys are touched.
 *
 * ⚠️ Cleanup is an afterEach, not a `finally`: a test that hits its timeout has
 * its `finally` cut short, which is how an early failing run left a "[E2E]"
 * member on the live roster. Hooks get their own time budget.
 */
const made: { id: string; email: string }[] = [];

test.afterEach(async () => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  for (const u of made.splice(0)) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
    await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(u.email)}`, {
      method: "DELETE",
      headers: h,
    });
  }
});

test("managers read work keys; an admin sets and clears them", async ({ page, browser }) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const password = `P-${run}-x9!`;
  const makeUser = async (label: string, role: "member" | "admin") => {
    const email = `e2e-${label}-${run}@example.test`;
    await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
      method: "POST",
      headers: { ...h, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ email, role }]),
    });
    const u = await (
      await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
    ).json();
    expect(u?.id, `fixture ${label}`).toBeTruthy();
    made.push({ id: u.id, email });
    const name = `[E2E] ${label} ${run}`;
    await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ name, role, confirmed_at: new Date().toISOString() }),
    });
    return { id: u.id as string, email, name };
  };
  const setKeys = (id: string, work_keys: string[]) =>
    fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ work_keys }),
    });
  const keysInDb = async (id: string) =>
    JSON.stringify(
      (await (await fetch(`${url}/rest/v1/profiles?id=eq.${id}&select=work_keys`, { headers: h })).json())?.[0]
        ?.work_keys,
    );
  const openKeys = async (p: Page, name: string) => {
    await p.goto("/team");
    await waitForApp(p);
    await p.getByRole("button", { name: `Skills for ${name}` }).click();
    return p.getByRole("dialog");
  };

  {
    const member = await makeUser("keys", "member");
    const admin = await makeUser("keyadmin", "admin");

    // ── Manager (the suite's bot): sees keys, cannot change them. ──
    await setKeys(member.id, ["IT|Level 2"]);
    await page.goto("/team");
    await waitForApp(page);
    await expect(page.getByRole("listitem").filter({ hasText: member.name }).getByText("IT L2")).toBeVisible();
    const ro = await openKeys(page, member.name);
    await expect(ro.getByRole("heading", { name: `${member.name} — Work keys & skills` })).toBeVisible();
    await expect(ro.getByText("Only admins can change work keys.")).toBeVisible();
    await expect(ro.getByRole("radiogroup")).toHaveCount(0);
    await setKeys(member.id, []);

    // ── Admin: a fresh, signed-out context, logged in as the throwaway admin. ──
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const ap = await ctx.newPage();
    try {
      await ap.goto("/login");
      await ap.waitForFunction(() => {
        const form = document.querySelector("form");
        return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
      }, { timeout: 30_000 });
      await ap.locator("#email").fill(admin.email);
      await ap.locator("#password").fill(password);
      await ap.getByRole("button", { name: /sign in/i }).click();
      await ap.waitForURL(/\/dashboard/, { timeout: 30_000 });

      const dialog = await openKeys(ap, member.name);
      await dialog.getByRole("radiogroup", { name: "IT level" }).getByRole("radio", { name: "L2" }).click();
      await expect.poll(() => keysInDb(member.id), { timeout: 15_000 }).toBe('["IT|Level 2"]');
      await dialog.getByRole("radiogroup", { name: "QA Tester level" }).getByRole("radio", { name: "L1" }).click();
      await expect
        .poll(() => keysInDb(member.id), { timeout: 15_000 })
        .toBe('["IT|Level 2","QA Tester|Level 1"]');
      expect(await hasHorizontalScroll(ap)).toBe(false);

      await dialog.getByRole("radiogroup", { name: "IT level" }).getByRole("radio", { name: "None" }).click();
      await expect.poll(() => keysInDb(member.id), { timeout: 15_000 }).toBe('["QA Tester|Level 1"]');
    } finally {
      await ctx.close();
    }
  }
});
