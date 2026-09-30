import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * The Estimator's Zoho-shaped pipeline board.
 *
 * Columns come from the org's live Deal `Stage` picklist, so the board can never
 * offer a stage the push route would reject. Dragging a card moves the real
 * deal — so the drag test issues its push against an **intercepted** route: the
 * client logic runs in full while nothing reaches the CRM.
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

/** Never a real deal id — the drag test mocks the route, but belt and braces. */
const FAKE_DEAL = "9990001112223334445";

/** A disposable estimate parked at a known stage. */
/**
 * A fixture name nobody else can be using.
 *
 * The three viewport projects run SERIALLY (`workers: 1`) but they run the same
 * tests, and every fixture was titled a fixed `[E2E] <label>`. So the same name
 * is created and deleted three times over against one shared database — and if
 * a row from the previous project lingers for even a moment (a `finally` that
 * did not land, or a delete that has not propagated before the next board
 * hydrates) the next test sees two cards with its own name.
 *
 * Tests here find their card BY TEXT, so a duplicate breaks both the `article`
 * filter (strict mode: two matches) and `columnOf`, which then returns two
 * columns where the test asserts one. Making the name unique per run removes
 * the whole class, whatever produced the leftover.
 */
const RUN_TOKEN = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function fixtureTitle(label: string): string {
  return `${E2E_PREFIX} ${label} ${RUN_TOKEN}`;
}

async function seed(label: string, stage: string | null): Promise<string | null> {
  const title = fixtureTitle(label);
  const res = await rest("proposals", {
    method: "POST",
    body: JSON.stringify({
      title,
      platform: "shopify",
      status: "draft",
      requirements_unclear: false,
      addons: {},
      line_items: [
        {
          id: "l1",
          title: "Work",
          base_hours: 12,
          tier: "basic",
          quantity: 1,
          hours: 12,
          depends_on: [],
        },
      ],
      zoho: stage
        ? {
            deal_id: FAKE_DEAL,
            deal_name: title,
            stage,
            imported_at: new Date().toISOString(),
          }
        : null,
    }),
  });
  if (!res.ok) return null;
  return JSON.parse(await res.text())[0].id as string;
}

async function openBoard(page: import("@playwright/test").Page) {
  await page.goto("/proposals");
  await waitForApp(page);
  await page.getByRole("button", { name: /^stages$/i }).click();
  await expect(page.locator("section[aria-label] h3").first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("stage board", () => {
  test("columns are the real Zoho pipeline, in Zoho's order", async ({
    page,
    request,
  }) => {
    const live = await request.get("/api/zoho/deal-stages");
    test.skip(!live.ok(), "Zoho not connected");
    const { stages } = (await live.json()) as {
      stages: { value: string; order: number }[];
    };
    test.skip(!stages.length, "No stages returned");

    await openBoard(page);
    const rendered = await page.locator("section[aria-label] h3").allInnerTexts();
    const expected = [...stages]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.value);

    // Every real stage must be a column — one that is not rendered is a stage
    // you cannot drag into.
    for (const value of expected) {
      expect(rendered, `${value} must have a column`).toContain(value);
    }
    // And in Zoho's own order, not alphabetical or insertion order.
    expect(rendered.filter((r) => expected.includes(r))).toEqual(expected);
  });

  test("shows only this app's estimates, and never hides one", async ({ page }) => {
    // A stage the pipeline does not list. This card must still appear.
    const orphan = await seed("orphan stage", "A Stage Zoho No Longer Has");
    const unlinked = await seed("no deal", null);
    test.skip(!orphan || !unlinked, "Couldn't seed the fixtures.");
    try {
      await openBoard(page);

      await expect(page.getByText(fixtureTitle("orphan stage"))).toBeVisible();
      await expect(page.getByText(fixtureTitle("no deal"))).toBeVisible();
      // The unknown stage earned its own column rather than swallowing the card.
      await expect(
        page.locator("section[aria-label] h3", {
          hasText: "A Stage Zoho No Longer Has",
        }),
      ).toBeVisible();
      // An estimate with no deal cannot be staged, and says so — by icon plus
      // accessible text rather than a sentence on the card, because the column
      // it sits in is already called "Not in Zoho".
      const unlinkedCard = page
        .locator("article")
        .filter({ hasText: fixtureTitle("no deal") });
      await expect(
        unlinkedCard.getByText("Not linked to a Zoho deal"),
      ).toBeAttached();
      // …and it offers no way to move it, because there is no deal to move.
      await expect(
        unlinkedCard.getByRole("button", { name: /Deal stage:/i }),
      ).toHaveCount(0);
      await expect(
        unlinkedCard.getByRole("button", { name: /^Drag /i }),
      ).toHaveCount(0);
    } finally {
      await rest(`proposals?id=eq.${orphan}`, { method: "DELETE" });
      await rest(`proposals?id=eq.${unlinked}`, { method: "DELETE" });
    }
  });

  /**
   * Drag a card onto `targetStage` while the push route is mocked to answer
   * `reply`. Where the card ends up is the assertion.
   *
   * Asserted on behaviour rather than on the request body: the push is
   * multipart, and neither `postData()` nor `postDataBuffer()` exposes its
   * field values to an intercepting route. Where the card lands proves both
   * things anyway — that the dropped column was transmitted, and that the
   * server's answer decides the result.
   *
   * ⚠️ `targetStage` must be a column that is **on screen** beside the card's
   * own. Eleven columns at 17rem run past 1280px, and dropping at an
   * off-viewport x silently clamps the pointer onto a different column — which
   * looked exactly like a collision-detection bug until the geometry was
   * printed. Adjacent stages keep both ends of the gesture visible.
   */
  async function dragAndSettle(
    page: import("@playwright/test").Page,
    label: string,
    targetStage: string,
    reply: Record<string, unknown>,
  ) {
    let calls = 0;
    await page.route("**/api/zoho/deals/*/push", async (route) => {
      calls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stageUpdated: false,
          stageAlreadySet: false,
          skipped: false,
          currentStage: null,
          attachmentUploaded: false,
          packagesWritten: 0,
          packagesReplaced: 0,
          warnings: [],
          ...reply,
        }),
      });
    });

    await openBoard(page);
    const handle = page.getByRole("button", {
      name: new RegExp(`^Drag .* ${label}`),
    });
    await expect(handle).toBeVisible({ timeout: 30_000 });

    const target = page.locator(`section[aria-label^="${targetStage}"]`);
    await expect(target).toBeVisible();
    await handle.hover();
    await page.mouse.down();
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    if (x >= page.viewportSize()!.width) {
      // At 375px a single column fills the viewport, so no second column is
      // ever on screen to drag onto — dragging between stages is a pointer
      // gesture, and the per-card stage menu is the path that works there
      // (covered by its own test below).
      await page.mouse.up();
      test.skip(true, `${targetStage} is off screen at this width — use the menu`);
    }
    // Two moves: the first clears the 8px activation threshold.
    await page.mouse.move(x, box.y + 60, { steps: 8 });
    await page.mouse.move(x, box.y + 70, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => calls, { timeout: 15_000 }).toBeGreaterThan(0);
  }

  /**
   * Poll Postgres for a proposal's settled stage.
   *
   * ⚠️ Never read the row with a bare `expect` straight after a UI action. The
   * store updates **optimistically** and writes through in the background, so
   * the card lands in its new column before the row is saved — a plain read
   * catches the old value, intermittently, and only under load. That is what a
   * full-suite flake turned out to be.
   */
  async function expectStoredStage(id: string, stage: string) {
    await expect
      .poll(
        async () =>
          (await (await rest(`proposals?select=zoho&id=eq.${id}`)).json())[0]?.zoho
            ?.stage,
        { timeout: 20_000 },
      )
      .toBe(stage);
  }

  /** Which column currently holds the card for `label`. */
  async function columnOf(page: import("@playwright/test").Page, label: string) {
    return page.evaluate((l) => {
      const hits: string[] = [];
      document.querySelectorAll("section[aria-label]").forEach((el) => {
        if ((el.textContent ?? "").includes(l)) {
          hits.push((el.getAttribute("aria-label") ?? "").split(" — ")[0]);
        }
      });
      return hits;
    }, label);
  }

  test("a drag lands the card in the column it was dropped on", async ({ page }) => {
    const id = await seed("accepted drag", "Discovery");
    test.skip(!id, "Couldn't seed the fixture.");
    try {
      // Server accepts: the deal really is at the target now.
      await dragAndSettle(page, "accepted drag", "Negotiation", {
        stageAlreadySet: true,
      });
      await expect
        .poll(() => columnOf(page, fixtureTitle("accepted drag")), {
          timeout: 15_000,
        })
        .toEqual(["Negotiation"]);
      await expectStoredStage(id!, "Negotiation");
    } finally {
      await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
    }
  });

  test("a held-back drag records the SETTLED stage, not the requested one", async ({
    page,
  }) => {
    const id = await seed("held drag", "Discovery");
    test.skip(!id, "Couldn't seed the fixture.");
    try {
      // Dropped on Negotiation, but the server holds the stage back and reports
      // the deal is still at Discovery. Recording the requested stage here is
      // exactly the bug this guards: the store would persist a stage the deal
      // never reached, over the value the route just wrote.
      await dragAndSettle(page, "held drag", "Negotiation", {
        skipped: true,
        currentStage: "Discovery",
        warnings: ["Deal left at Discovery."],
      });
      await expect
        .poll(() => columnOf(page, fixtureTitle("held drag")), { timeout: 15_000 })
        .toEqual(["Discovery"]);
      await expectStoredStage(id!, "Discovery");
    } finally {
      await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
    }
  });

  test("a card's stage menu moves it, at every width", async ({ page }) => {
    // The path that works on a phone, and the only one available to a keyboard.
    // Drag is a pointer gesture across a scroller; this is not a nicety.
    const id = await seed("menu move", "Discovery");
    test.skip(!id, "Couldn't seed the fixture.");
    let called = false;
    await page.route("**/api/zoho/deals/*/push", async (route) => {
      called = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stageUpdated: true,
          stageAlreadySet: false,
          skipped: false,
          currentStage: "Negotiation",
          attachmentUploaded: false,
          packagesWritten: 0,
          packagesReplaced: 0,
          warnings: [],
        }),
      });
    });
    try {
      await openBoard(page);
      const card = page
        .locator("article")
        .filter({ hasText: fixtureTitle("menu move") });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const trigger = card.getByRole("button", { name: /Deal stage:/i });
      await expect(trigger).toBeEnabled();
      await trigger.click();
      // The dropdown loads the picklist when it opens and renders "Loading
      // stages…" until it lands. Waiting for the item rather than clicking
      // straight through gives that the expect timeout instead of the shorter
      // action timeout — the difference showed up once as a full-suite flake.
      const item = page.getByRole("menuitem", { name: /^Negotiation/ });
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.click();

      await expect.poll(() => called, { timeout: 15_000 }).toBe(true);
      await expect
        .poll(() => columnOf(page, fixtureTitle("menu move")), { timeout: 15_000 })
        .toEqual(["Negotiation"]);
      await expectStoredStage(id!, "Negotiation");
    } finally {
      await rest(`proposals?id=eq.${id}`, { method: "DELETE" });
    }
  });

  test("cards carry the CRM's own fields, and flag a passed closing date", async ({
    page,
  }) => {
    // Zoho's card reads deal → account → contact → amount → closing date, with
    // the date red once it has passed. Someone who works this pipeline in the
    // CRM is scanning for exactly those.
    const e = env();
    const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const key = e.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) test.skip(true, "Supabase service role is not configured.");

    const make = async (label: string, closing: string) => {
      const title = fixtureTitle(label);
      const res = await rest("proposals", {
        method: "POST",
        body: JSON.stringify({
          title,
          platform: "shopify",
          status: "draft",
          requirements_unclear: false,
          addons: {},
          line_items: [
            { id: "l1", title: "Work", base_hours: 8, tier: "basic", quantity: 1, hours: 8, depends_on: [] },
          ],
          zoho: {
            deal_id: FAKE_DEAL,
            // The card renders `deal_name`, so the fixture keeps the prefix
            // there too — otherwise it is unfindable by the E2E marker.
            deal_name: title,
            account: `Acct ${label}`,
            contact: `Person ${label}`,
            stage: "Discovery",
            closing_date: closing,
            imported_at: new Date().toISOString(),
          },
        }),
      });
      return res.ok ? (JSON.parse(await res.text())[0].id as string) : null;
    };

    const past = await make("late deal", "2020-01-15");
    const future = await make("future deal", "2099-12-31");
    test.skip(!past || !future, "Couldn't seed the fixtures.");
    try {
      await openBoard(page);
      const lateCard = page
        .locator("article")
        .filter({ hasText: fixtureTitle("late deal") });
      await expect(lateCard).toBeVisible({ timeout: 30_000 });

      // Account and contact come from the CRM link, not the quote's own title.
      await expect(lateCard.getByText("Acct late deal")).toBeVisible();
      await expect(lateCard.getByText("Person late deal")).toBeVisible();

      // A passed closing date is called out; a future one is not. Asserted on
      // the classification rather than the pixel colour — the computed value
      // comes back as `lab(…)`, where an RGB channel comparison is meaningless.
      // What matters is that `isOverdue` decided correctly: it uses the shared
      // calendar-day comparison, because `new Date(iso) < now` on a DATE string
      // is UTC midnight and flags a date a day early west of Greenwich.
      const dateEl = (text: string) =>
        page.locator("article span", { hasText: text }).first();
      await expect(dateEl("2020-01-15")).toHaveAttribute("title", /has passed/i);
      await expect(dateEl("2099-12-31")).toHaveAttribute("title", /^Closes /i);
      // …and the two are visually distinguishable, whatever the colour space.
      const colourOf = (text: string) =>
        dateEl(text).evaluate((n) => getComputedStyle(n).color);
      expect(await colourOf("2020-01-15")).not.toBe(await colourOf("2099-12-31"));
    } finally {
      await rest(`proposals?id=eq.${past}`, { method: "DELETE" });
      await rest(`proposals?id=eq.${future}`, { method: "DELETE" });
    }
  });

  test("winning the deal in-app promotes the estimate, and spares a rejected one", async ({
    page,
  }) => {
    // ⚠️ The gap this guards: the won-promotion lived inside the background
    // poll, so moving a deal to Closed Won from the board or the status changer
    // wrote the stage and nothing else — the estimate stayed `draft` and
    // "Start project" never appeared. Found live, on an estimate that already
    // had a PO raised against it.
    const seedWith = async (label: string, status: string) => {
      const title = fixtureTitle(label);
      const res = await rest("proposals", {
        method: "POST",
        body: JSON.stringify({
          title,
          platform: "shopify",
          status,
          requirements_unclear: false,
          addons: {},
          line_items: [
            { id: "l1", title: "Work", base_hours: 9, tier: "basic", quantity: 1, hours: 9, depends_on: [] },
          ],
          zoho: {
            deal_id: FAKE_DEAL,
            deal_name: title,
            stage: "Discovery",
            imported_at: new Date().toISOString(),
          },
        }),
      });
      return res.ok ? (JSON.parse(await res.text())[0].id as string) : null;
    };

    const draft = await seedWith("promote me", "draft");
    const rejected = await seedWith("stay rejected", "rejected");
    test.skip(!draft || !rejected, "Couldn't seed the fixtures.");

    await page.route("**/api/zoho/deals/*/push", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stageUpdated: true,
          stageAlreadySet: false,
          skipped: false,
          currentStage: "Closed Won",
          attachmentUploaded: false,
          packagesWritten: 0,
          packagesReplaced: 0,
          warnings: [],
        }),
      }),
    );

    const moveToWon = async (label: string) => {
      const card = page.locator("article").filter({ hasText: fixtureTitle(label) });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const trigger = card.getByRole("button", { name: /Deal stage:/i });
      await expect(trigger).toBeEnabled();
      await trigger.click();
      const item = page.getByRole("menuitem", { name: /^Closed Won/ });
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.click();
    };

    try {
      await openBoard(page);
      await moveToWon("promote me");
      // Winning IS the approval — this is what puts "Start project" on screen.
      await expect
        .poll(
          async () =>
            (await (await rest(`proposals?select=status&id=eq.${draft}`)).json())[0]
              ?.status,
          { timeout: 20_000 },
        )
        .toBe("approved");

      await moveToWon("stay rejected");
      // A rejected quote was a deliberate call; a won deal must not reverse it.
      await page.waitForTimeout(2500);
      const after = await (
        await rest(`proposals?select=status,zoho&id=eq.${rejected}`)
      ).json();
      expect(after[0].status, "a rejected estimate stays rejected").toBe("rejected");
      // …but its stage still moved, because that part is not a judgement call.
      expect(after[0].zoho.stage).toBe("Closed Won");
    } finally {
      await rest(`proposals?id=eq.${draft}`, { method: "DELETE" });
      await rest(`proposals?id=eq.${rejected}`, { method: "DELETE" });
    }
  });

  test("columns scroll inside their own container, not the page", async ({ page }) => {
    await openBoard(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
    const strip = page.locator("section[aria-label]").first().locator("..");
    expect(await strip.evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true);
  });

  test("a full column scrolls on its own — the page does not grow with it", async ({ page }) => {
    await openBoard(page);
    const column = page.locator("section[aria-label]").first();
    const list = column.locator(":scope > div").last();
    const pageHeight = () => page.evaluate(() => document.documentElement.scrollHeight);
    const before = await pageHeight();
    // Stuff the first column with 40 card-sized blocks — far more than fits.
    // DOM-only, nothing is written: this measures the layout, not the data.
    await list.evaluate((n) => {
      for (let i = 0; i < 40; i++) {
        const d = document.createElement("div");
        d.style.height = "96px";
        d.dataset.probe = "1";
        n.appendChild(d);
      }
    });
    expect(await list.evaluate((n) => n.scrollHeight > n.clientHeight + 1000)).toBe(true);
    expect(await pageHeight()).toBeLessThanOrEqual(before + 2);
    const box = await column.boundingBox();
    expect(box!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 900) * 1.2);
  });
});
