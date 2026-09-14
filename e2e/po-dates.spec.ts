import { expect, test } from "@playwright/test";

import { format, parseISO } from "date-fns";

import { analyzeDiscovery } from "../lib/discovery";
import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { estimateDateRange } from "../lib/discovery/from-line-items";
import type { ClientQuote } from "../types/proposal.types";

/**
 * The PBS purchase order's project date range.
 *
 * PBS treats `start_date` / `end_date` as optional and **defaults each to the
 * current UTC date**, so omitting them files a months-long project as starting
 * and ending today. The PO and its date record are written in one transaction
 * and neither can be edited afterwards, which makes this a one-shot value.
 */
const QUOTE = (over: Partial<ClientQuote> = {}): ClientQuote =>
  ({
    id: "q1",
    title: "Q",
    project_id: null,
    platform: "shopify",
    status: "approved",
    requirements_unclear: false,
    line_items: [],
    addons: {},
    discovery: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as ClientQuote;

const LINE = (hours: number) => ({
  id: `l${hours}`,
  title: "Work",
  base_hours: hours,
  tier: "basic" as const,
  quantity: 1,
  hours,
  depends_on: [],
});

test.describe("estimateDateRange", () => {
  test("is null when there is nothing to schedule", () => {
    // An invented range on a billing record is worse than no range: the dialog
    // can say so and make someone choose.
    expect(estimateDateRange(QUOTE())).toBeNull();
    expect(estimateDateRange(QUOTE({ line_items: [LINE(0)] }))).toBeNull();
  });

  test("returns ISO dates, not the timeline's display strings", () => {
    // `DiscoveryTimeline` formats as "MMM d, yyyy", which no API accepts.
    const r = estimateDateRange(QUOTE({ line_items: [LINE(80)] }));
    expect(r).not.toBeNull();
    expect(r!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("the end never precedes the start — PBS rejects that range", () => {
    for (const hours of [1, 8, 40, 500]) {
      const r = estimateDateRange(QUOTE({ line_items: [LINE(hours)] }));
      expect(r!.end >= r!.start, `${hours}h`).toBe(true);
    }
  });

  test("more work pushes the end date out", () => {
    const small = estimateDateRange(QUOTE({ line_items: [LINE(8)] }))!;
    const big = estimateDateRange(QUOTE({ line_items: [LINE(400)] }))!;
    expect(big.end > small.end).toBe(true);
    // Same start: both are tentative timelines beginning today.
    expect(big.start).toBe(small.start);
  });

  test("a guided estimate starts on its answered project start date", () => {
    // The PO must line up with the Gantt everyone is looking at, not with today.
    const r = estimateDateRange(
      QUOTE({
        line_items: [LINE(40)],
        discovery: { project_start_date: "2026-03-02" } as never,
      }),
    );
    expect(r!.start).toBe("2026-03-02");
    expect(r!.end > "2026-03-02").toBe(true);
  });

  test("an unparseable answered start falls back rather than throwing", () => {
    for (const bad of ["", "not-a-date", "2026-13-45"]) {
      const r = estimateDateRange(
        QUOTE({ line_items: [LINE(40)], discovery: { project_start_date: bad } as never }),
      );
      expect(r, JSON.stringify(bad)).not.toBeNull();
      expect(r!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

test.describe("the PO range agrees with the timeline on screen", () => {
  // The coordinator reads a launch date off the Gantt and the client is billed
  // against the PO's range. If those two disagree, nothing in either system
  // says so — and PBS cannot edit the range afterwards.
  const guided = (start: string) =>
    QUOTE({
      line_items: [LINE(200)],
      discovery: { ...createEmptyDiscoveryProject(), project_start_date: start } as never,
    });

  test("starts exactly on the answered project start date", () => {
    expect(estimateDateRange(guided("2026-09-04"))!.start).toBe("2026-09-04");
  });

  test("never ends before the launch date the Gantt shows", () => {
    // `totalBusinessDays` is the max across phases, so it covers the launch
    // phase and any phase (e.g. SEO) that outruns it. Ending earlier would bill
    // a range that closes before the project goes live.
    for (const start of ["2026-01-05", "2026-09-04", "2027-02-01"]) {
      const q = guided(start);
      const range = estimateDateRange(q)!;
      const launch = analyzeDiscovery(q.discovery!).timeline.launchDate;
      const endLabel = format(parseISO(range.end), "MMM d, yyyy");
      expect(
        parseISO(range.end) >= parseISO(format(parseISO(range.start), "yyyy-MM-dd")),
        start,
      ).toBe(true);
      expect(
        new Date(endLabel) >= new Date(launch),
        `${start}: PO ends ${endLabel}, launch is ${launch}`,
      ).toBe(true);
    }
  });
});

test.describe("the create-PO route validates the range", () => {
  // Every case below is refused BEFORE PBS is called, so nothing is created.
  const BAD: [string, Record<string, unknown>][] = [
    ["a malformed start", { startDate: "01-01-2026", endDate: "2026-12-31" }],
    ["a malformed end", { startDate: "2026-01-01", endDate: "2026/12/31" }],
    // Date.parse rolls these over instead of rejecting them (Feb 31 -> Mar 3,
    // Apr 31 -> May 1), so a typo would reach PBS as a different, permanent date.
    ["Feb 31st", { startDate: "2026-02-31", endDate: "2026-12-31" }],
    ["Apr 31st", { startDate: "2026-01-01", endDate: "2026-04-31" }],
    ["month 13", { startDate: "2026-13-01", endDate: "2026-12-31" }],
    ["day zero", { startDate: "2026-01-00", endDate: "2026-12-31" }],
    ["a backwards range", { startDate: "2026-12-31", endDate: "2026-01-01" }],
  ];

  for (const [label, dates] of BAD) {
    test(`refuses ${label}`, async ({ request }) => {
      const res = await request.post("/api/pbs/pos", {
        data: {
          proposalId: "00000000-0000-0000-0000-000000000000",
          name: "[E2E] must not be created",
          clientId: "32",
          ...dates,
        },
      });
      expect(res.status(), label).toBe(400);
      expect((await res.json()).error).toMatch(/date/i);
    });
  }

  test("an equal start and end is allowed — PBS permits a single-day range", async ({
    request,
  }) => {
    // Must fail on the UNKNOWN QUOTE, not on the dates: proves the range passed
    // validation without creating anything.
    const res = await request.post("/api/pbs/pos", {
      data: {
        proposalId: "00000000-0000-0000-0000-000000000000",
        name: "[E2E] must not be created",
        clientId: "32",
        startDate: "2026-05-05",
        endDate: "2026-05-05",
      },
    });
    expect(res.status()).toBe(404);
  });
});
