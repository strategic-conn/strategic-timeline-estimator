import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";

/**
 * Everything a test creates carries this prefix, so cleanup can find it and a
 * human can spot leftovers instantly in the UI. Never remove data without it.
 */
export const E2E_PREFIX = "[E2E]";

/** A unique, obviously-disposable name for a record a test is about to create. */
export function e2eName(label: string): string {
  return `${E2E_PREFIX} ${label} ${Date.now().toString(36)}`;
}

/**
 * Fails the test if a page logged a real console error.
 *
 * Next.js dev and some third-party scripts emit benign noise, so known-harmless
 * patterns are filtered — otherwise the check cries wolf and gets ignored.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const IGNORE = [
    /Download the React DevTools/i,
    /React Router Future Flag/i,
    /favicon/i,
    /\[Fast Refresh\]/i,
    // Dev-only hydration noise from browser extensions injecting into the DOM.
    /Extra attributes from the server/i,
  ];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * True when the document scrolls horizontally — the classic responsive failure.
 * A 1px tolerance avoids false positives from sub-pixel rounding.
 */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1;
  });
}

/** Waits for the app shell to be interactive (not just for the network to idle). */
export async function waitForApp(page: Page): Promise<void> {
  await page.getByRole("main").waitFor({ state: "visible", timeout: 30_000 });
}

/** `.env.local` merged under `process.env`, for the few checks that need the DB. */
export function env(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* fall back to process env */
  }
  return { ...out, ...(process.env as Record<string, string>) };
}

/**
 * An estimate that is linked to a Zoho deal, resolved live.
 *
 * The guard tests need a real quote/deal pair, and hardcoding one rots the
 * moment somebody deletes that estimate — which is exactly what happened: the
 * old QA id started returning 404, so two guards silently stopped testing the
 * guard and started testing "quote not found". Read-only.
 */
export async function linkedQuote(): Promise<{
  quoteId: string;
  dealId: string;
} | null> {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/proposals?select=id,zoho&zoho->>deal_id=not.is.null&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return null;
  const [row] = (await res.json()) as {
    id: string;
    zoho: { deal_id?: string };
  }[];
  return row?.zoho?.deal_id
    ? { quoteId: row.id, dealId: row.zoho.deal_id }
    : null;
}

/**
 * Give the realtime channels time to JOIN before writing rows they should catch.
 *
 * ⚠️ `postgres_changes` is not a replay log. A row written before the channel
 * has joined is never delivered — there is no backfill — so a test that writes
 * the instant the page is interactive is racing the subscription, not testing
 * it. `liveChannels` (components/layouts/workspace-sync.tsx) has to await the
 * cookie session before subscribing, because bindings are RLS-checked at join
 * time, so the join lands a few hundred ms after first paint.
 *
 * ponytail: a settle, not a poll — nothing in the UI reports subscription
 * state. If that ever becomes flaky, have `liveChannels` mark the DOM on
 * SUBSCRIBED and wait for that instead.
 */
export async function settleRealtime(page: Page): Promise<void> {
  await page.waitForTimeout(3000);
}

/**
 * Open the PO step. Every project is billed, so the PO is step 3 of Start
 * project (options → review schedule → billing). Writes nothing.
 */
export async function openBillingStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^start project$/i }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /review schedule/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: /next: billing/i }).click();
  await page.getByRole("dialog").getByText("Billing — the project's PO").waitFor();
}
