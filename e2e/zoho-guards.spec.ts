import { expect, test } from "@playwright/test";

/**
 * The guards on the two write surfaces that reach production systems.
 *
 * Every request here is **read-only or a proven no-op**: a stage that doesn't
 * exist (refused before Zoho is called), a stage the deal is already at (the
 * route skips the PUT), a mismatched deal, an unknown quote, and the auth gates.
 * Nothing in this file moves a deal or creates a PO.
 *
 * ⚠️ NOT covered here, deliberately: the `POST /api/pbs/pos` won-stage gate.
 * Asserting it means asking a live billing system to create a PO and trusting it
 * to refuse — and PBS has no delete endpoint, so a regression would leave a real
 * PO behind. Check it in a sandbox instead (see e2e/README.md).
 *
 * Needs the app running with Zoho connected; the deal below is the QA record.
 */

const QUOTE = "c859c9ad-a90b-4585-9c68-a64c3178edb3";
const DEAL = "3805132000161523001";

test.describe("auth", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [name, call] of [
    [
      "creating a PO",
      (r: import("@playwright/test").APIRequestContext) =>
        r.post("/api/pbs/pos", {
          data: { proposalId: QUOTE, name: "[E2E] anon", clientId: "1" },
        }),
    ],
    [
      "moving a deal stage",
      (r: import("@playwright/test").APIRequestContext) =>
        r.post(`/api/zoho/deals/${DEAL}/push`, {
          multipart: { proposalId: QUOTE, stage: "Discovery" },
        }),
    ],
    [
      "reading the stage picklist",
      (r: import("@playwright/test").APIRequestContext) =>
        r.get("/api/zoho/deal-stages"),
    ],
  ] as const) {
    test(`${name} needs a session`, async ({ request }) => {
      expect((await call(request)).status()).toBe(401);
    });
  }
});

test.describe("stage push guards", () => {
  test("a stage the pipeline doesn't have never reaches Zoho", async ({ request }) => {
    const res = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: QUOTE, stage: "Totally Made Up Stage" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/isn't a stage in this Zoho pipeline/);
  });

  test("a quote linked to a different deal is refused", async ({ request }) => {
    const res = await request.post("/api/zoho/deals/9999999999999999999/push", {
      multipart: { proposalId: QUOTE, stage: "Discovery" },
    });
    expect(res.status()).toBe(409);
  });

  test("an unknown quote is refused", async ({ request }) => {
    const res = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: "00000000-0000-0000-0000-000000000000", stage: "Discovery" },
    });
    expect(res.status()).toBe(404);
  });

  test("pushing the stage a deal is already at writes nothing", async ({ request }) => {
    // `explicit` is the status-changer path, where "already there" is the answer.
    // Without it, Discovery goes through the import guard, which says the same
    // thing in its own shape — both are asserted so neither drifts.
    const stages = await (await request.get("/api/zoho/deal-stages")).json();
    const live = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: QUOTE, stage: "Discovery", explicit: "1" },
    });
    const body = await live.json();
    test.skip(
      body.currentStage !== "Discovery",
      `QA deal has moved to ${body.currentStage} — this no-op assertion needs it at Discovery`,
    );
    expect(body.stageAlreadySet).toBe(true);
    expect(body.stageUpdated).toBe(false);
    expect(stages.stages.length).toBeGreaterThan(0);

    // Same answer without the flag: "already there" beats any hold rule, so a
    // send that targets Discovery on a deal already at Discovery writes nothing
    // rather than reporting it was refused.
    const asImport = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: QUOTE, stage: "Discovery" },
    });
    const imported = await asImport.json();
    expect(imported.stageAlreadySet).toBe(true);
    expect(imported.skipped).toBe(false);
    expect(imported.stageUpdated).toBe(false);
  });
});

test.describe("estimate price -> Packages", () => {
  /**
   * No file, and the deal is already at the target stage, so Zoho is read but
   * never written. What this proves is the plumbing: the estimate total reaches
   * `applyEstimateToDeal`, and the never-overwrite guard holds.
   */
  test("the total reaches the sync layer and never clobbers existing rows", async ({ request }) => {
    const res = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: QUOTE, stage: "Discovery", totalHours: "438.33", totalAmount: "43833" },
    });
    const b = await res.json();
    test.skip(b.currentStage !== "Discovery", `QA deal moved to ${b.currentStage}`);
    expect(res.ok()).toBeTruthy();
    expect(b.stageUpdated, "stage must not move").toBe(false);
    expect(b.attachmentUploaded, "no file was sent").toBe(false);
    // Only reachable when wantsPackages was true — i.e. the total got through.
    expect(b.warnings.join(" ")).toMatch(/already has \d+ Packages row/i);
  });

  test("a zero total does not invent an empty priced row", async ({ request }) => {
    const res = await request.post(`/api/zoho/deals/${DEAL}/push`, {
      multipart: { proposalId: QUOTE, stage: "Discovery", totalHours: "0", totalAmount: "0" },
    });
    const b = await res.json();
    expect(res.ok()).toBeTruthy();
    expect(b.warnings.join(" ")).not.toMatch(/Packages row/i);
  });
});

test("the pipeline order the backwards-guard relies on is real", async ({ request }) => {
  const res = await request.get("/api/zoho/deal-stages");
  test.skip(!res.ok(), "Zoho not connected");
  const { stages } = (await res.json()) as { stages: { value: string; order: number }[] };
  const order = (v: string) => stages.find((s) => s.value === v)?.order ?? -1;

  // A send targets "Discovery". These are the comparisons that stop it dragging a
  // deal sales has already advanced back down to the start of the pipeline.
  for (const later of [
    "Negotiation",
    "Proposal Sent",
    "Verbal Yes",
    "Proposal Signed",
    "Closed Won",
    "Project Completed",
  ]) {
    expect(order(later), `${later} must sort after Discovery`).toBeGreaterThan(
      order("Discovery"),
    );
  }
  // Every stage must have a real position, or the guard silently does nothing.
  for (const s of stages) expect(s.order, `${s.value} order`).toBeGreaterThanOrEqual(0);
});
