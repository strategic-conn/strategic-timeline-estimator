/**
 * Create (or reset) the dedicated end-to-end test account.
 *
 * Idempotent. Uses the service-role key + plain HTTP (supabase-js pulls in a
 * realtime/WebSocket dep that breaks on Node 20 — see scripts/seed-dev-team.mjs).
 *
 *   node scripts/seed-e2e-user.mjs
 *
 * Prints the credentials to add to .env.local (which is gitignored). The account
 * is a `manager` so it can reach the Estimator, and is clearly named so it's
 * obvious in the Team list. Remove it any time via Team → deactivate → delete.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const EMAIL = "e2e.bot@example.com";
const NAME = "E2E Test Bot";
const ROLE = "manager";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* fall back to process.env */
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function req(path, opts = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...opts,
    headers: { ...H, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

// A fresh strong password each run; only ever written to .env.local by hand.
const password = `E2e!${randomBytes(12).toString("base64url")}`;

const listed = await req("/auth/v1/admin/users?per_page=1000");
if (!listed.ok) {
  console.error("listUsers failed:", listed.status, listed.body);
  process.exit(1);
}
const users = Array.isArray(listed.body) ? listed.body : (listed.body?.users ?? []);
const existing = users.find((u) => (u.email ?? "").toLowerCase() === EMAIL.toLowerCase());

if (existing) {
  // Reset the password so the test suite always has working credentials.
  const upd = await req(`/auth/v1/admin/users/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!upd.ok) {
    console.error("password reset failed:", upd.status, upd.body);
    process.exit(1);
  }
  console.log(`reset  ${NAME} <${EMAIL}>`);
} else {
  // handle_new_user() requires the address to be on the invite allowlist first.
  const allow = await req("/rest/v1/allowed_emails?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ email: EMAIL, role: ROLE }]),
  });
  if (!allow.ok) {
    console.error("allowlist failed:", allow.status, allow.body);
    process.exit(1);
  }
  const made = await req("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: NAME },
    }),
  });
  if (!made.ok) {
    console.error("createUser failed:", made.status, made.body);
    process.exit(1);
  }
  console.log(`created ${NAME} <${EMAIL}>`);
}

// Make sure the profile is confirmed + has the right role/name.
// confirmed_at is a FIXED past date, not now(): onboarding tours treat anyone
// confirmed after TOURS_LAUNCHED_AT as a newcomer, and a newcomer gets a
// welcome dialog and nudges that would sit on top of every other test.
// e2e/tours.spec.ts makes its own throwaway newcomer when it needs one.
await req(`/rest/v1/profiles?email=eq.${encodeURIComponent(EMAIL)}`, {
  method: "PATCH",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ name: NAME, role: ROLE, confirmed_at: "2026-01-01T00:00:00Z" }),
});

// And the one-time "New: page tours" hint, already seen, so it cannot toast
// over a layout test on the bot's first run.
const bot = await req(
  `/rest/v1/profiles?email=eq.${encodeURIComponent(EMAIL)}&select=id`,
);
const botId = Array.isArray(bot.body) ? bot.body[0]?.id : null;
if (botId) {
  await req(`/rest/v1/tour_progress?on_conflict=profile_id,tour_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { profile_id: botId, tour_id: "intro-hint", version: 1, status: "dismissed" },
    ]),
  });
}

console.log("\nAdd these to .env.local (gitignored):\n");
console.log(`E2E_EMAIL=${EMAIL}`);
console.log(`E2E_PASSWORD=${password}`);
