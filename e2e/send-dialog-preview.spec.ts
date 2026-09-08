import { expect, test } from "@playwright/test";

import { linkedQuote, waitForApp } from "./helpers";

/**
 * The send dialog is the gate on an irreversible write: replacing a Deal's
 * Packages subform drops every row it had, Zoho has no undo, and there is no
 * DELETE scope. So the dialog must state what it is about to destroy BEFORE the
 * button works — and both of its reads (the live deal, the product catalogue)
 * must have landed, because the payload is built from them at click time.
 *
 * Read-only: the dialog is opened and inspected, never submitted.
 */
test.describe("send dialog preview", () => {
  test("names what it will replace, and waits for both reads first", async ({ page }) => {
    const found = await linkedQuote();
    test.skip(!found, "No estimate is linked to a Zoho deal.");

    await page.goto(`/proposals/${found!.quoteId}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /review/i }).click();
    await page
      .getByRole("button", { name: /send to zoho|update .*zoho/i })
      .first()
      .click();

    const dlg = page.getByRole("dialog");
    await dlg.waitFor();

    // Submit is disabled while either read is outstanding. "Reading the deal…"
    // is the label for that state; waiting for the real label is what proves
    // the gate resolves rather than sticking.
    const submit = dlg.getByRole("button", { name: /update deal|create deal/i });
    await expect(submit).toBeEnabled({ timeout: 30_000 });

    const text = await dlg.innerText();

    // The price, always — it is the field the estimate exists to communicate.
    expect(text).toMatch(/Amount/);
    expect(text).toMatch(/\$[\d,]+/);

    // A deal this app has already sent to has rows, so the count must be
    // concrete. "replaces any existing rows" is the read-failed wording and
    // must never be what a working connection shows.
    if (/Replaces/i.test(text)) {
      expect(
        text,
        "a resolved read must give a count, not the unknown-state wording",
      ).toMatch(/Replaces \d+ Packages row/i);
    }

    // Never the loading placeholder once submit is live — that would mean the
    // payload could be built from an unfinished catalogue read.
    expect(text).not.toMatch(/Reading the catalogue description…/);
    expect(text).not.toMatch(/Reading the deal…/);
  });
});

test("warns even when it CANNOT tell what it would replace", async ({ page }) => {
  // The safety-critical branch. If the live deal read fails, an absent warning
  // reads as "nothing to replace" — and the send still overwrites the subform.
  // Unknown must look like risk, not like safety.
  const found = await linkedQuote();
  test.skip(!found, "No estimate is linked to a Zoho deal.");
  await page.route("**/api/zoho/deals/stages*", (r) =>
    r.fulfill({ status: 502, contentType: "application/json", body: '{"error":"down"}' }),
  );
  await page.goto(`/proposals/${found!.quoteId}`);
  await waitForApp(page);
  await page.getByRole("tab", { name: /review/i }).click();
  await page.getByRole("button", { name: /send to zoho|update .*zoho/i }).first().click();

  const dlg = page.getByRole("dialog");
  // A failed read must not leave the button disabled forever either.
  await expect(dlg.getByRole("button", { name: /update deal/i })).toBeEnabled({
    timeout: 40_000,
  });
  const text = await dlg.innerText();
  expect(text).toMatch(/replaces any existing rows/i);
  expect(text).toMatch(/Replaces any Packages rows/i);
  // Never a concrete count it cannot actually know.
  expect(text).not.toMatch(/Replaces \d+ Packages row/i);
});

test("shows the price move when the CRM and the estimate disagree", async ({ page }) => {
  const found = await linkedQuote();
  test.skip(!found, "No estimate is linked to a Zoho deal.");
  await page.route("**/api/zoho/deals/stages*", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stages: { [found!.dealId]: "Discovery" },
        amounts: { [found!.dealId]: 1 },
        packageRows: { [found!.dealId]: 3 },
        checkedAt: new Date().toISOString(),
      }),
    }),
  );
  await page.goto(`/proposals/${found!.quoteId}`);
  await waitForApp(page);
  await page.getByRole("tab", { name: /review/i }).click();
  await page.getByRole("button", { name: /send to zoho|update .*zoho/i }).first().click();

  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("button", { name: /update deal/i })).toBeEnabled({
    timeout: 40_000,
  });
  const text = await dlg.innerText();
  // The old CRM figure, struck through, next to the new one.
  expect(text).toMatch(/\$1\s*→\s*\$[\d,]+/);
  expect(text).toMatch(/replaces 3 existing rows/i);
});
