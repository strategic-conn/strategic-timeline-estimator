import { expect, test } from "@playwright/test";

import { canRaisePo, stageIsWon, type ZohoStageInfo } from "../lib/zoho/push-state";

/**
 * The rule that decides whether a PBS purchase order may be created.
 *
 * Worth a check of its own because it is the one place in this app where being
 * wrong costs money someone has to unpick by hand: **PBS has no delete
 * endpoint**. A false positive bills a deal that was never won.
 *
 * Pure — no browser, no network, no Supabase, no Zoho. It runs in the existing
 * Playwright suite only because that is the TypeScript runner this repo already
 * has; nothing here touches live data, so it is safe on every project/viewport.
 */

/** This org's real pipeline, as read from `/api/zoho/deal-stages`. */
const LIVE: ZohoStageInfo[] = [
  { value: "Discovery", order: 1, forecast: "Open", probability: 25 },
  { value: "Negotiation", order: 2, forecast: "Open", probability: 35 },
  { value: "Proposal Requested", order: 3, forecast: "Open", probability: 45 },
  { value: "Proposal Sent", order: 4, forecast: "Open", probability: 50 },
  { value: "Verbal Yes", order: 5, forecast: "Open", probability: 60 },
  { value: "Proposal Signed", order: 6, forecast: "Open", probability: 90 },
  { value: "Closed Won", order: 7, forecast: "Closed Won", probability: 100 },
  { value: "Closed Lost", order: 8, forecast: "Closed Lost", probability: 0 },
  {
    value: "Not at this time maybe later",
    order: 9,
    forecast: "Open",
    probability: 20,
  },
  { value: "Project Completed", order: 10, forecast: "Closed Won", probability: 0 },
];

test.describe("won-stage rule", () => {
  test("only won stages unlock billing", () => {
    expect(stageIsWon("Closed Won", LIVE)).toBe(true);
    // Also in Zoho's won bucket. A deal that jumped straight here can never go
    // back, so refusing it would strand its PO forever.
    expect(stageIsWon("Project Completed", LIVE)).toBe(true);
  });

  test("nothing else does", () => {
    for (const stage of [
      "Discovery",
      "Negotiation",
      "Proposal Requested",
      "Proposal Sent",
      "Verbal Yes",
      "Proposal Signed", // 90% is still not a win
      "Not at this time maybe later",
    ]) {
      expect(stageIsWon(stage, LIVE), stage).toBe(false);
    }
  });

  test("a lost deal is never billable", () => {
    // The one that must never regress: "Closed Lost" contains "Closed", and its
    // forecast bucket name contains "Closed" too. Only /won/ may pass.
    expect(stageIsWon("Closed Lost", LIVE)).toBe(false);
    expect(stageIsWon("Closed Lost", [])).toBe(false);
  });

  test("falls back to names when the picklist is unavailable", () => {
    // `looksWon` (the client hint) and a Zoho settings outage both land here.
    expect(stageIsWon("Closed Won", [])).toBe(true);
    expect(stageIsWon("Project Completed", [])).toBe(true);
    expect(stageIsWon("Proposal Sent", [])).toBe(false);
    expect(stageIsWon("Some Renamed Won Stage", [])).toBe(false);
  });

  test("no stage is not a won stage", () => {
    expect(stageIsWon(null, LIVE)).toBe(false);
    expect(stageIsWon(undefined, LIVE)).toBe(false);
    expect(stageIsWon("", LIVE)).toBe(false);
  });

  /**
   * The fixture above cannot catch a wrong FIELD NAME, and that is the mistake
   * this rule actually shipped with: `forecast_category` reads as an opaque id
   * ("3805132000000006789"), so `stageIsWon` classified every stage as not-won
   * and would have refused billing on genuinely won deals. The readable bucket
   * is `forecast_type`. Only live data catches that, so this one reads it.
   *
   * Read-only, like the rest of the suite's Zoho calls. Needs the app running
   * and Zoho connected.
   */
  test("the live picklist returns readable buckets, not ids", async ({ request }) => {
    const res = await request.get("/api/zoho/deal-stages");
    test.skip(!res.ok(), "Zoho not connected");
    const { stages } = (await res.json()) as { stages: ZohoStageInfo[] };
    expect(stages.length).toBeGreaterThan(0);
    for (const s of stages) {
      expect(s.forecast, `${s.value} forecast`).toMatch(/^(Open|Closed Won|Closed Lost)$/);
    }
    // And the rule agrees with the real pipeline, not just the fixture.
    expect(stageIsWon("Closed Won", stages)).toBe(true);
    expect(stageIsWon("Closed Lost", stages)).toBe(false);
    expect(stageIsWon("Proposal Sent", stages)).toBe(false);
  });

  test("the button only shows when the deal is won and nothing is billed", () => {
    const won = { zoho: { stage: "Closed Won" } };
    expect(canRaisePo(won)).toBe(true);
    expect(canRaisePo({ zoho: { stage: "Proposal Sent" } })).toBe(false);
    expect(canRaisePo({ zoho: { stage: "Closed Lost" } })).toBe(false);
    expect(canRaisePo({})).toBe(false);
    // Already billed, by either identifier. The header button used to test only
    // po_no, so a PO with an id and no number showed a button that opened
    // straight onto "already billed".
    expect(canRaisePo({ ...won, pbs: { po_no: "STR-001" } })).toBe(false);
    expect(canRaisePo({ ...won, pbs: { po_id: 4210 } })).toBe(false);
    expect(canRaisePo({ ...won, pbs: { po_no: null, po_id: null } })).toBe(true);
  });

  test("a renamed stage is judged by its bucket, not its name", () => {
    // The reason the picklist is read at all: renaming the stage must not break
    // billing, and inventing a stage with a won bucket must not be missed.
    expect(
      stageIsWon("Signed & Won", [
        { value: "Signed & Won", order: 7, forecast: "Closed Won", probability: 100 },
      ]),
    ).toBe(true);
  });
});
