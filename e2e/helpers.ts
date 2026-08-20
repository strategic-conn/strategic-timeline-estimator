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
