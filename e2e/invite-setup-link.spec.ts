import { expect, test, type Browser, type Page } from "@playwright/test";

import { env, waitForApp } from "./helpers";

/**
 * The invite → set-password flow, including the bug that broke it.
 *
 * ⚠️ The bug (2026-10-03): the invite email linked to Supabase's own verify
 * step, which spends its one-time token on a plain GET. Microsoft SafeLinks
 * opens every link in a work inbox first, so the SCANNER accepted the invite —
 * the account turned confirmed — and the person's click landed on the home page
 * with `#error_code=otp_expired`, no session and no password. Re-inviting then
 * refused ("already has an active account"). This spec reproduces the scanner
 * exactly (a server-side verify of a one-time token) and walks the way out.
 *
 * Throwaway "[E2E]" accounts only, deleted in afterEach. Desktop project only:
 * it is a flow test, and three copies would triple the accounts it makes.
 */

const made: { id: string; email: string }[] = [];

function supa() {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const svc = e.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = e.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const S = { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" };
  return { url, svc, anon, S };
}

test.afterEach(async () => {
  const { url, S } = supa();
  for (const u of made.splice(0)) {
    if (u.id) await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: S });
    await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(u.email)}`, {
      method: "DELETE",
      headers: S,
    });
  }
});

async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.waitForFunction(() => {
    const form = document.querySelector("form");
    return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
  }, { timeout: 30_000 });
  await p.locator("#email").fill(email);
  await p.locator("#password").fill(password);
  await p.getByRole("button", { name: /sign in/i }).click();
  await p.waitForURL(/\/dashboard/, { timeout: 30_000 });
  return p;
}

test("a scanner-burned invite gets a working password setup link", async ({ browser, page }, info) => {
  test.skip(info.project.name !== "desktop", "flow test — runs once");
  test.setTimeout(180_000);
  const { url, anon, S } = supa();
  test.skip(!url || !S.apikey, "no Supabase credentials");

  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pw = `P-${run}-x9!long`;

  // ── A throwaway admin (the suite's bot is a manager; links are admin-only). ──
  const adminEmail = `e2e-linkadmin-${run}@example.test`;
  await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
    method: "POST",
    headers: { ...S, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ email: adminEmail, role: "admin" }]),
  });
  const adm = await (
    await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: S,
      body: JSON.stringify({ email: adminEmail, password: pw, email_confirm: true }),
    })
  ).json();
  made.push({ id: adm.id, email: adminEmail });
  await fetch(`${url}/rest/v1/profiles?id=eq.${adm.id}`, {
    method: "PATCH",
    headers: S,
    body: JSON.stringify({ name: `[E2E] link admin ${run}`, role: "admin", confirmed_at: "2026-01-01T00:00:00Z" }),
  });

  // ── The invitee, invited for real, then "opened" by a scanner. ──
  const email = `e2e-scanned-${run}@example.test`;
  await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
    method: "POST",
    headers: { ...S, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ email, role: "member" }]),
  });
  const inv = await (
    await fetch(`${url}/auth/v1/invite`, { method: "POST", headers: S, body: JSON.stringify({ email }) })
  ).json();
  expect(inv.id, "invite created").toBeTruthy();
  made.push({ id: inv.id, email });
  const once = await (
    await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: S,
      body: JSON.stringify({ type: "magiclink", email }),
    })
  ).json();
  const scanned = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: once.hashed_token }),
  });
  expect(scanned.ok, "the scanner's verify succeeds — that is the bug").toBe(true);
  const after = await (await fetch(`${url}/auth/v1/admin/users/${inv.id}`, { headers: S })).json();
  expect(after.email_confirmed_at, "account now looks confirmed").toBeTruthy();

  // ── A manager may not make setup links. ──
  const mgr = await page.request.post("/api/invites/link", { data: { email } });
  expect(mgr.status(), "manager refused").toBe(403);

  const ap = await signIn(browser, adminEmail, pw);
  try {
    // Re-inviting no longer dead-ends: it hands back a setup link, sends no email.
    const reinvite = await ap.request.post("/api/invites", { data: { email, role: "member" } });
    expect(reinvite.status()).toBe(200);
    const ri = await reinvite.json();
    expect(ri.emailed).toBe(false);
    expect(ri.setupLink).toMatch(/\/auth\/confirm\?token_hash=.+&type=recovery&next=%2Faccept-invite/);

    // The key button's endpoint gives a link too (and cancels the one above).
    const linkRes = await ap.request.post("/api/invites/link", { data: { email } });
    expect(linkRes.status()).toBe(200);
    const { url: setupUrl } = (await linkRes.json()) as { url: string };

    // A scanner opening OUR link spends nothing: it only renders a page.
    const scan = await fetch(setupUrl);
    expect(scan.status).toBe(200);

    // The person: open the link, press Continue, choose a password.
    const pctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pp = await pctx.newPage();
    try {
      await pp.goto(setupUrl);
      await pp.getByRole("button", { name: "Continue" }).click();
      await pp.waitForURL(/\/accept-invite/, { timeout: 30_000 });
      await expect(pp.getByText(`Finish setting up ${email}.`)).toBeVisible({ timeout: 15_000 });
      await pp.locator("#invite-password").fill(pw);
      await pp.locator("#invite-confirm").fill(pw);
      await pp.getByRole("button", { name: "Create account" }).click();
      await pp.waitForURL(/\/dashboard/, { timeout: 30_000 });
      await waitForApp(pp);
    } finally {
      await pctx.close();
    }

    // They can now sign in with that password, and are marked as set up.
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    });
    expect(login.ok, "password sign-in works").toBe(true);
    await expect
      .poll(async () => (await (await fetch(`${url}/auth/v1/admin/users/${inv.id}`, { headers: S })).json()).app_metadata?.password_set)
      .toBe(true);

    // From now on an admin can't make a link for them (no signing in as them).
    const refused = await ap.request.post("/api/invites/link", { data: { email } });
    expect(refused.status()).toBe(409);
    const reinvite2 = await ap.request.post("/api/invites", { data: { email, role: "member" } });
    expect(reinvite2.status()).toBe(400);
    expect((await reinvite2.json()).error).toMatch(/already has an active account/);
  } finally {
    await ap.context().close();
  }
});

test("a used-up link explains itself instead of stranding them on the home page", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "flow test — runs once");
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  try {
    // Exactly the URL from the bug report.
    await p.goto("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=");
    await p.waitForURL(/\/login\?error=link_expired/, { timeout: 30_000 });
    await expect(p.getByText(/already been used or has expired/)).toBeVisible();
    expect(p.url(), "the error hash is dropped").not.toContain("otp_expired");

    // The same error landing on /accept-invite (the invite's redirectTo).
    await p.goto("/accept-invite#error=access_denied&error_code=otp_expired");
    await expect(p.getByText("This link has already been used or has expired.")).toBeVisible({ timeout: 15_000 });
    await expect(p.getByRole("link", { name: /send yourself a password link/i })).toBeVisible();

    // "Forgot password" is reachable without signing in (it bounced to /login).
    await p.goto("/forgot-password");
    await expect(p).toHaveURL(/\/forgot-password/);
  } finally {
    await ctx.close();
  }
});
