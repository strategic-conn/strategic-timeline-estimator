import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Signs in once as the dedicated E2E account; every other project reuses the
 * saved session, so tests don't re-authenticate (and don't hammer Supabase auth).
 *
 * Credentials live in .env.local (gitignored). Create/reset the account with:
 *   node scripts/seed-e2e-user.mjs
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  expect(
    email && password,
    "E2E_EMAIL / E2E_PASSWORD missing from .env.local — run: node scripts/seed-e2e-user.mjs",
  ).toBeTruthy();

  await page.goto("/login");

  // Wait for React to hydrate before touching the form. Until it does, the form
  // is plain HTML and clicking Submit performs a native GET — which navigates to
  // /login?email=...&password=... (leaking the password into the URL) instead of
  // running the sign-in handler. React tags hydrated DOM nodes with __react* keys.
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
  }, { timeout: 30_000 });

  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Guard the regression explicitly: credentials must never reach the query string.
  await expect(page).not.toHaveURL(/password=/);

  // The app redirects to the dashboard once the session cookie is set.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("main")).toBeVisible();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
