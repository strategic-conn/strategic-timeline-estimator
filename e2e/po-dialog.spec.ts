import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The Create PO dialog — the gate on the app's only irreversible external
 * write. PBS has no delete endpoint, so what this dialog says must be literally
 * true before the button is pressed.
 *
 * Read-only: a disposable estimate is created in Postgres so the dialog is
 * reachable at all (it only appears for a won, unbilled quote), and removed
 * afterwards. The PBS create is never issued.
 */
async function rest(path: string, init?: RequestInit) {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
}

/** A won estimate with no PO and no Zoho deal, so nothing external is touched. */
async function wonQuote(label: string): Promise<string | null> {
  const res = await rest("proposals", {
    method: "POST",
    body: JSON.stringify({
      title: `${E2E_PREFIX} ${label}`,
      platform: "shopify",
      status: "approved",
      requirements_unclear: false,
      line_items: [
        { id: "l1", title: "Work", base_hours: 10, tier: "basic", quantity: 1, hours: 10, depends_on: [] },
      ],
      addons: {},
      zoho: { stage: "Closed Won", imported_at: new Date().toISOString() },
    }),
  });
  if (!res.ok) return null;
  return JSON.parse(await res.text())[0].id as string;
}

test.describe("Create PO dialog", () => {
  test("states client, template and that it cannot be undone", async ({ page }) => {
    const id = await wonQuote("PO dialog");
    test.skip(!id, "Couldn't create the fixture estimate.");
    try {
      await page.goto(`/proposals/${id}`);
      await waitForApp(page);
      await page.getByRole("button", { name: /create po/i }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();

      const submit = dlg.getByRole("button", { name: /create po|link po/i }).first();
      // Disabled while PBS is being checked — a create must never be confirmed
      // before the app knows whether a PO already exists.
      await expect(submit).toBeEnabled({ timeout: 40_000 });

      const text = await dlg.innerText();
      expect(text).toMatch(/Client/);
      expect(text).toMatch(/Template/);
      expect(text, "the irreversibility must always be stated").toMatch(
        /no delete endpoint/i,
      );

      // ── The project date range ──
      // PBS defaults both to today when they are omitted, so they must always
      // be present and filled — never blank inputs someone can skip past.
      const start = dlg.locator("#po-start");
      const end = dlg.locator("#po-end");
      await expect(start).toBeVisible();
      await expect(end).toBeVisible();
      expect(await start.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(await end.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(await end.inputValue() >= (await start.inputValue())).toBe(true);

      // A backwards range must block the button, not fail at PBS.
      await start.fill("2030-01-01");
      await end.fill("2029-01-01");
      await expect(submit).toBeDisabled();
      expect(await dlg.innerText()).toMatch(/end date must be on or after/i);
      await end.fill("2030-06-01");
      await expect(submit).toBeEnabled();

      // Both inputs fully inside the viewport at every width.
      for (const [name, el] of [["start", start], ["end", end]] as const) {
        const box = await el.boundingBox();
        expect(box!.x, name).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, name).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
      }
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
    }
  });

  test("offers to LINK, not create, when PBS already has a candidate", async ({ page }) => {
    const id = await wonQuote("PO candidate");
    test.skip(!id, "Couldn't create the fixture estimate.");
    // Simulated rather than colliding with a real PO name. Read side only.
    await page.route("**/api/pbs/pos?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidate: {
            po_id: "12653", po_no: "STR000428", name: `${E2E_PREFIX} PO candidate`,
            client_id: "32", project_template_id: "33",
            create_date: "2026-09-04 15:01:44", create_by: "web estimator",
            matchCount: 2,
          },
        }),
      }),
    );
    try {
      await page.goto(`/proposals/${id}`);
      await waitForApp(page);
      await page.getByRole("button", { name: /create po/i }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();

      // The action must change, not just the copy — otherwise the button says
      // "Create PO" while the server would refuse and link instead.
      await expect(dlg.getByRole("button", { name: /link po STR000428/i })).toBeVisible({
        timeout: 40_000,
      });
      await expect(dlg.getByRole("button", { name: /^create po$/i })).toHaveCount(0);

      // Linking records a PO whose dates PBS already holds and this app cannot
      // change — editable date fields there would look like they set something.
      await expect(dlg.locator("#po-start")).toHaveCount(0);
      await expect(dlg.locator("#po-end")).toHaveCount(0);
      // And the button must not be gated on a range it never sends.
      await expect(
        dlg.getByRole("button", { name: /link po STR000428/i }),
      ).toBeEnabled();

      const text = await dlg.innerText();
      expect(text).toMatch(/PBS already has PO STR000428/);
      expect(text, "who made it and when is how a human judges the match").toMatch(
        /web estimator/,
      );
      // Ambiguity has to be surfaced, never resolved silently.
      expect(text).toMatch(/2 POs share that name/);
      // And the summary row must not still promise a generated number.
      expect(text).not.toMatch(/generated by PBS/);
      expect(await hasHorizontalScroll(page)).toBe(false);
    } finally {
      await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
    }
  });
});
