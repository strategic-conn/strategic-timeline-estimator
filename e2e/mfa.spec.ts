import { createHmac } from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  mfaState,
  shouldRemindTwoFactor,
  TWO_FACTOR_REMIND_OFF_VERSION,
} from "../lib/auth/mfa-gate";
import { env, waitForApp } from "./helpers";

/**
 * Two-factor sign-in (0052 + proxy + /mfa + Settings → Security + Team reset).
 *
 * Live Supabase, two throwaway "[E2E]" accounts (a member who enrols, an admin
 * who resets it), deleted in afterEach. TOTP codes are computed here from the
 * enrolment secret (RFC 6238), so no phone is involved.
 */

function totp(secret: string, step = Math.floor(Date.now() / 30_000)): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** A code from a time step not used yet — a TOTP code is single-use. */
let lastStep = 0;
async function freshCode(secret: string): Promise<string> {
  while (Math.floor(Date.now() / 30_000) <= lastStep) await new Promise((r) => setTimeout(r, 1000));
  lastStep = Math.floor(Date.now() / 30_000);
  return totp(secret, lastStep);
}

const made: { id: string; email: string }[] = [];
test.afterEach(async () => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const h = { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` };
  for (const u of made.splice(0)) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
    await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(u.email)}`, { method: "DELETE", headers: h });
  }
});

test("the gate rule", () => {
  expect(mfaState({ hasVerifiedFactor: false, aal: "aal1", required: false })).toBe("ok");
  expect(mfaState({ hasVerifiedFactor: false, aal: "aal1", required: true })).toBe("enroll");
  expect(mfaState({ hasVerifiedFactor: true, aal: "aal1", required: false })).toBe("verify");
  expect(mfaState({ hasVerifiedFactor: true, aal: undefined, required: true })).toBe("verify");
  expect(mfaState({ hasVerifiedFactor: true, aal: "aal2", required: true })).toBe("ok");
});

test("the set-up reminder waits 14 days between showings", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const ago = (days: number) => ({ at: new Date(now - days * 86_400_000).toISOString(), version: 1 });
  expect(shouldRemindTwoFactor({ hasFactor: false, last: undefined, now })).toBe(true);
  expect(shouldRemindTwoFactor({ hasFactor: false, last: ago(13.9), now })).toBe(false);
  expect(shouldRemindTwoFactor({ hasFactor: false, last: ago(14), now })).toBe(true);
  // Has an app, or not known yet → never.
  expect(shouldRemindTwoFactor({ hasFactor: true, last: undefined, now })).toBe(false);
  expect(shouldRemindTwoFactor({ hasFactor: null, last: undefined, now })).toBe(false);
  // The e2e bot's "never" marker.
  expect(
    shouldRemindTwoFactor({ hasFactor: false, last: { ...ago(400), version: TWO_FACTOR_REMIND_OFF_VERSION }, now }),
  ).toBe(false);
});

test("enrol, the database refuses a password-only session, sign-in asks for the code, an admin resets it", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is enough");
  test.setTimeout(240_000);
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const svc = e.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = e.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  test.skip(!url || !svc || !anon, "no Supabase credentials");
  const sh = { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" };

  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const password = `P-${run}-x9!`;
  const makeUser = async (label: string, role: "member" | "admin") => {
    const email = `e2e-${label}-${run}@example.test`;
    await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
      method: "POST",
      headers: { ...sh, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ email, role }]),
    });
    const u = await (
      await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: sh,
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
    ).json();
    expect(u?.id, `fixture ${label}`).toBeTruthy();
    made.push({ id: u.id, email });
    const name = `[E2E] ${label} ${run}`;
    await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
      method: "PATCH",
      headers: sh,
      body: JSON.stringify({ name, role, confirmed_at: new Date().toISOString() }),
    });
    return { id: u.id as string, email, name };
  };
  const auth = async (path: string, token: string, body?: unknown) =>
    (
      await fetch(`${url}/auth/v1/${path}`, {
        method: "POST",
        headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      })
    ).json();
  const login = async (email: string) =>
    (await auth("token?grant_type=password", anon, { email, password })).access_token as string;
  const rows = async (token: string) => {
    const r = await fetch(`${url}/rest/v1/profiles?select=id`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return ((await r.json()) as unknown[]).length;
  };
  const factorCount = async (id: string) =>
    ((await (await fetch(`${url}/auth/v1/admin/users/${id}`, { headers: sh })).json()).factors ?? []).filter(
      (f: { status: string }) => f.status === "verified",
    ).length;
  const signIn = async (b: Browser, email: string): Promise<Page> => {
    const ctx = await b.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
    }, { timeout: 30_000 });
    await p.locator("#email").fill(email);
    await p.locator("#password").fill(password);
    await p.getByRole("button", { name: /sign in/i }).click();
    return p;
  };

  const user = await makeUser("mfa", "member");
  const admin = await makeUser("mfaadmin", "admin");

  // 1. No factor: a password session reads normally (nothing changes for anyone
  //    who hasn't turned 2FA on).
  const aal1 = await login(user.email);
  expect(await rows(aal1)).toBeGreaterThan(0);

  // 2. Enrol over the API and verify → an aal2 session.
  const factor = await auth("factors", aal1, { factor_type: "totp", friendly_name: `e2e ${run}` });
  expect(factor?.totp?.secret, JSON.stringify(factor)).toBeTruthy();
  const secret = factor.totp.secret as string;
  const challenge = await auth(`factors/${factor.id}/challenge`, aal1);
  const verified = await auth(`factors/${factor.id}/verify`, aal1, {
    challenge_id: challenge.id,
    code: await freshCode(secret),
  });
  expect(verified?.access_token, JSON.stringify(verified)).toBeTruthy();

  // 3. The database is the gate: password-only sessions now see nothing — the
  //    old token and a brand-new password login alike — while aal2 reads.
  expect(await rows(aal1)).toBe(0);
  expect(await rows(await login(user.email))).toBe(0);
  expect(await rows(verified.access_token)).toBeGreaterThan(0);

  // 4. Browser: password → /mfa (pages AND api are held) → code → dashboard.
  const up = await signIn(browser, user.email);
  await up.waitForURL(/\/mfa/, { timeout: 30_000 });
  expect((await up.request.post("/api/notifications/email", { data: { ids: [] } })).status()).toBe(401);
  await up.goto("/dashboard");
  await up.waitForURL(/\/mfa/);
  await up.locator("#mfa-code").fill(await freshCode(secret));
  await up.getByRole("button", { name: "Verify" }).click();
  await up.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await waitForApp(up);
  await up.goto("/mfa");
  await up.waitForURL(/\/dashboard/); // nothing owed → /mfa sends you on
  await up.context().close();

  // 5. Lost phone: an admin resets it from Team, behind a confirm.
  const ap = await signIn(browser, admin.email);
  await ap.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await ap.goto("/team");
  await waitForApp(ap);
  await ap.getByRole("button", { name: `Reset two-factor for ${user.name}` }).click();
  await ap.getByRole("alertdialog").getByRole("button", { name: "Reset two-factor" }).click();
  await expect(ap.getByText(`Two-factor reset for ${user.name}`)).toBeVisible();
  expect(await factorCount(user.id)).toBe(0);
  expect(await rows(await login(user.email))).toBeGreaterThan(0);
  await ap.context().close();

  // 6. Self-service set-up from Settings → Security, then turn it off again.
  const sp = await signIn(browser, user.email);
  await sp.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await sp.goto("/settings?tab=security");
  await sp.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(sp.getByAltText("QR code for your authenticator app")).toBeVisible();
  const key = (await sp.locator("span.select-all").innerText()).trim();
  await sp.locator("#totp-enroll-code").fill(await freshCode(key));
  await sp.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(sp.getByText("Two-factor sign-in is on").first()).toBeVisible();
  expect(await factorCount(user.id)).toBe(1);
  await sp.getByRole("button", { name: "Turn off" }).click();
  await sp.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(sp.getByText("Two-factor sign-in is off")).toBeVisible();
  expect(await factorCount(user.id)).toBe(0);
  await sp.context().close();
});
