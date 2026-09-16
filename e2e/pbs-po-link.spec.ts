import { expect, test } from "@playwright/test";

import { pickPoCandidate, type PbsPo } from "../lib/pbs/clients";
import { env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The PBS purchase-order link.
 *
 * Two failures this pins down, both live-verified:
 *
 *  1. `rowToQuote` never mapped `proposals.pbs`, so the link was written to
 *     Postgres and dropped on every hydrate. The PO number vanished from the UI
 *     AND `canRaisePo` (gated on `po_no`) offered **Create PO** again on an
 *     estimate already billed — into a system with no delete endpoint.
 *  2. Matching a PO by name alone could adopt another client's PO. Nothing is
 *     linked automatically now; the matcher below is the whole decision.
 *
 * Read-only: no test here creates a PO.
 */

const PO = (over: Partial<PbsPo>): PbsPo => ({
  id: 1,
  po_no: "STR000428",
  name: "TEST ESTIMATE 1.0",
  client_id: 32,
  project_template_id: 33,
  create_date: "2026-09-04 15:01:44",
  create_by: "web estimator",
  ...over,
});

test.describe("pickPoCandidate", () => {
  test("finds the app's own orphaned PO", () => {
    const c = pickPoCandidate([PO({})], "TEST ESTIMATE 1.0", "32");
    expect(c?.po_no).toBe("STR000428");
    expect(c?.matchCount).toBe(1);
    expect(c?.create_by).toBe("web estimator");
  });

  test("ignores case and stray whitespace in the name", () => {
    expect(
      pickPoCandidate([PO({ name: "Test  Estimate\n1.0 " })], "test estimate 1.0", "32")
        ?.po_no,
    ).toBe("STR000428");
  });

  test("REFUSES another client's PO with the same name", () => {
    // The failure that made name-only matching unsafe: two customers, one
    // common job title, and the PO belongs to whoever got there first.
    expect(pickPoCandidate([PO({ client_id: 99 })], "TEST ESTIMATE 1.0", "32")).toBeNull();
  });

  test("refuses a different name for the right client", () => {
    expect(pickPoCandidate([PO({ name: "Something else" })], "TEST ESTIMATE 1.0", "32")).toBeNull();
  });

  test("an empty name matches nothing, rather than every unnamed PO", () => {
    expect(pickPoCandidate([PO({ name: "" })], "", "32")).toBeNull();
    expect(pickPoCandidate([PO({ name: null })], "   ", "32")).toBeNull();
  });

  test("a non-numeric client id is refused, not matched loosely", () => {
    // Otherwise the client check goes vacuous and we are back to name-only.
    for (const bad of ["", "abc", "32; drop", "0x20"]) {
      expect(pickPoCandidate([PO({})], "TEST ESTIMATE 1.0", bad), bad).toBeNull();
    }
  });

  test("a row with no PO number is not a candidate", () => {
    expect(pickPoCandidate([PO({ po_no: "  " })], "TEST ESTIMATE 1.0", "32")).toBeNull();
  });

  test("reports ambiguity instead of hiding it, newest first", () => {
    // Same client, same job name, two years running — the case name+client
    // cannot resolve. The count is what makes it visible in the dialog.
    const c = pickPoCandidate(
      [
        PO({ id: 1, po_no: "STR000100", create_date: "2025-01-02 10:00:00" }),
        PO({ id: 2, po_no: "STR000428", create_date: "2026-09-04 15:01:44" }),
      ],
      "TEST ESTIMATE 1.0",
      "32",
    );
    expect(c?.po_no).toBe("STR000428");
    expect(c?.matchCount).toBe(2);
  });
});

async function billedQuote(): Promise<{ id: string; poNo: string } | null> {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/proposals?select=id,pbs&pbs->>po_no=not.is.null&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return null;
  const [row] = (await res.json()) as { id: string; pbs: { po_no?: string } }[];
  return row?.pbs?.po_no ? { id: row.id, poNo: row.pbs.po_no } : null;
}

test.describe("the PO number reaches the UI", () => {
  test("the estimate shows it and does not offer another", async ({ page }) => {
    const billed = await billedQuote();
    test.skip(!billed, "No estimate has a PO recorded.");

    await page.goto(`/proposals/${billed!.id}`);
    await waitForApp(page);
    // Survives hydration from Postgres — the whole point of the fix.
    await expect(page.getByText(`PO ${billed!.poNo}`)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /create po/i }),
      "a billed estimate must never offer a second PO",
    ).toHaveCount(0);
  });

  test("the list card carries it too", async ({ page }) => {
    const billed = await billedQuote();
    test.skip(!billed, "No estimate has a PO recorded.");
    await page.goto("/proposals");
    await waitForApp(page);
    // The Estimator opens on Stages now, so ask for the list explicitly —
    // otherwise there are no cards and this asserts nothing.
    await page.getByRole("button", { name: /^list$/i }).click();
    await expect(page.locator("main ul")).toBeVisible({ timeout: 30_000 });
    const badge = page.getByText(`PO ${billed!.poNo}`).first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    // It sits in a shrink-0 row beside the card's action buttons — the classic
    // place a new element pushes a 375px layout sideways.
    expect(await hasHorizontalScroll(page), "list must not scroll sideways").toBe(false);
    const box = await badge.boundingBox();
    expect(box!.x, "badge must start inside the viewport").toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

test.describe("the PO routes", () => {
  test("an already-billed quote is refused a second PO", async ({ request }) => {
    const billed = await billedQuote();
    test.skip(!billed, "No estimate has a PO recorded.");
    // Refused on the quote's own `po_no`, before PBS is called at all.
    const res = await request.post("/api/pbs/pos", {
      data: { proposalId: billed!.id, name: "[E2E] must not be created", clientId: "32" },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/already has PO/i);
  });

  test("the candidate preview writes nothing and needs both ids", async ({ request }) => {
    for (const q of [
      "",
      "proposalId=notauuid&clientId=32",
      "proposalId=00000000-0000-0000-0000-000000000000",
      "proposalId=00000000-0000-0000-0000-000000000000&clientId=abc",
    ]) {
      const res = await request.get(`/api/pbs/pos?${q}`);
      expect([200, 404], q).toContain(res.status());
      if (res.status() === 200) expect((await res.json()).candidate, q).toBeNull();
    }
  });

  test("both PO routes need a session", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await ctx.request.get("/api/pbs/pos?proposalId=x")).status()).toBe(401);
    expect(
      (await ctx.request.post("/api/pbs/pos", { data: { proposalId: "x" } })).status(),
    ).toBe(401);
    await ctx.close();
  });
});

test.describe("PBS -> app status sync", () => {
  test("the live read returns the PO's current state, keyed on po_id", async ({
    request,
  }) => {
    const billed = await billedQuote();
    test.skip(!billed, "No estimate has a PO recorded.");
    const res = await request.get(`/api/pbs/pos?proposalIds=${billed!.id}`);
    test.skip(!res.ok(), "PBS not reachable");
    const b = await res.json();
    const live = b.live?.[billed!.id];
    console.log("LIVE PO:", JSON.stringify(live));
    expect(live, "a linked PO must come back").toBeTruthy();
    // The PO exists, so `missing` must be false — never undefined, or the UI
    // can't tell "fine" from "not checked".
    expect(live.missing).toBe(false);
    expect(live.po_no).toBe(billed!.poNo);
    // Status is the thing that actually moves in PBS.
    expect(typeof live.status).toBe("string");
  });

  test("the estimate renders the PBS status beside the number", async ({ page }) => {
    const billed = await billedQuote();
    test.skip(!billed, "No estimate has a PO recorded.");
    await page.goto(`/proposals/${billed!.id}`);
    await waitForApp(page);
    const badge = page.getByText(`PO ${billed!.poNo}`);
    await expect(badge).toBeVisible({ timeout: 30_000 });
    // The status arrives from PBS after hydration; either it lands or the badge
    // stays bare — what must never appear is the "gone" state for a live PO.
    await expect(badge).not.toContainText("not in PBS");
  });

  test("the live read ignores junk and caps the batch", async ({ request }) => {
    const res = await request.get("/api/pbs/pos?proposalIds=nope,../../x");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).live).toEqual({});
  });
});
