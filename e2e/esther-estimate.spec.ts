import { expect, test, type Page } from "@playwright/test";

import { apiSchema } from "../lib/esther/estimate/api-schema";
import {
  contextFromAnswers,
  linesFromDraft,
  schedulePlanFromAnswers,
  uncoveredRequirements,
} from "../lib/esther/estimate/build";
import {
  draftResultSchema,
  scanResultSchema,
  type ConfirmedAnswers,
  type DraftResult,
  type ScanResult,
} from "../lib/esther/estimate/types";
import { catalogForPlatform } from "../lib/proposal-catalog";
import { progressAt } from "../components/features/esther-estimate/EstherMagic";
import { MOODS, restingFrame } from "../components/features/esther-estimate/EstherFace";
import { existsSync } from "node:fs";
import * as XLSX from "xlsx";
import { looksLikeWorkbook, spreadsheetText } from "../lib/esther/estimate/spreadsheet";
import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * "Let Esther estimate". Three layers, none of which calls Claude:
 *  1. the pure rules that turn Esther's reply into line items (build.ts) and
 *     the schemas sent to the API;
 *  2. the real routes with no API key configured (auth, document checks);
 *  3. the whole UI flow with the two Esther routes mocked — drop a file, see
 *     her work, answer what's missing, land on a reviewable estimate.
 * The estimate the UI test creates is `[E2E]`-named and deleted afterwards.
 */

const WP = catalogForPlatform("wordpress");
const ROW = WP.find((r) => r.base_hours >= 2)!;

const sourced = <T,>(value: T, source: "document" | "guess" | "none" = "none", quote = "") => ({
  value,
  source,
  quote,
});

const SCAN: ScanResult = {
  project_title: `${E2E_PREFIX} Esther bakery site`,
  client_name: "Sunrise Bakery",
  summary: "A small bakery wants a new website with an online order form and a menu page.",
  platform: sourced("wordpress", "document", "we use WordPress today"),
  primary_goal: sourced("lead_gen", "guess"),
  is_redesign: sourced(true, "document", "replace our old site"),
  current_url: sourced("https://example.com", "document", "example.com"),
  regulated_industry: sourced(false, "guess"),
  regulated_type: sourced(null),
  start_date: sourced(null),
  hard_deadline: sourced(null),
  review_days: sourced(null),
  blackout: sourced(null),
  blackout_notes: sourced(null),
  requirements: [
    { id: "R1", area: "Pages", text: "Home, About and Menu pages", quote: "" },
    { id: "R2", area: "Features", text: "Online order form for cakes", quote: "order cakes online" },
    { id: "R3", area: "Integrations", text: "Sync orders to their POS", quote: "" },
  ],
  questions: [
    {
      id: "Q1",
      question: "How many cake types will be on the order form?",
      why: "More types means more form logic.",
      kind: "choice",
      options: ["Up to 10", "10 to 30", "More than 30"],
      suggested: "Up to 10",
    },
  ],
};

const DRAFT: DraftResult = {
  lines: [
    {
      catalog_id: ROW.id,
      title: "ignored for catalog rows",
      base_hours: 999,
      responsible: "Creative",
      level: 2,
      tier: "basic",
      quantity: 3,
      adjusted_hours: 50, // no finished-task history → ignored
      requirement_ids: ["R1"],
      note: "The three pages they listed.",
    },
    {
      catalog_id: null,
      title: "Cake order form with flavour options",
      base_hours: 7.3,
      responsible: "IT",
      level: 1,
      tier: "advanced",
      quantity: 1,
      adjusted_hours: null,
      requirement_ids: ["R2"],
      note: "Not in the catalog: a custom order form.",
    },
  ],
  assumptions: ["Client supplies all photos", "Two rounds of revisions"],
  open_questions: ["Which POS do they use?"],
  requirements_unclear: false,
};

const ANSWERS: ConfirmedAnswers = {
  title: `${E2E_PREFIX} Esther bakery site`,
  client_name: "Sunrise Bakery",
  platform: "wordpress",
  primary_goal: "lead_gen",
  is_redesign: true,
  current_url: "https://example.com",
  regulated_industry: false,
  regulated_type: "legal",
  start_date: "2026-12-01",
  hard_deadline: "nonsense",
  review_days: 99,
  blackout: false,
  blackout_notes: "should be dropped",
  extra: {},
};

test.describe("rules (pure)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  test("the schemas sent to Claude use only what structured outputs accept", () => {
    const bad = new Set(["$schema", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"]);
    // Both go in one request each; the API refuses more than 16 union-typed fields
    // ("anyOf" / type arrays), and a big union count compiles into a grammar it
    // rejects as too large — found on the first live run (2026-11-24).
    for (const schema of [scanResultSchema, draftResultSchema]) {
      let unions = 0;
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        if (o.anyOf || Array.isArray(o.type)) unions++;
        for (const k of Object.keys(o)) expect(bad.has(k), `unsupported key ${k}`).toBe(false);
        if (o.type === "object") {
          expect(o.additionalProperties).toBe(false);
          expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
        }
        Object.values(o).forEach(walk);
      };
      walk(apiSchema(schema));
      expect(unions, "union-typed fields").toBeLessThanOrEqual(8);
    }
  });

  test("the progress bar is time-based but never claims done before the answer", () => {
    expect(progressAt(0, 40)).toBe(0);
    expect(progressAt(40, 40)).toBeGreaterThan(75); // about 80% at the usual time
    expect(progressAt(40, 40)).toBeLessThan(85);
    expect(progressAt(10_000, 40)).toBeLessThanOrEqual(95); // a very slow answer never fills it
    expect(progressAt(20, 40)).toBeLessThan(progressAt(21, 40)); // always moving
  });

  test("every frame Esther's face plays exists, and each mood settles somewhere", () => {
    for (const [mood, { steps, loop }] of Object.entries(MOODS)) {
      for (const [frame] of steps) expect(existsSync(`public/esther/esther-${frame}.webp`), frame).toBe(true);
      // A mood either loops or ends on a hold (ms 0) — never stops mid-blink.
      if (loop === undefined) expect(steps.at(-1)![1], mood).toBe(0);
      expect(existsSync(`public/esther/esther-${restingFrame(mood as keyof typeof MOODS)}.webp`)).toBe(true);
    }
  });

  test("a spreadsheet reaches Esther as text: every sheet, values not formulas, no blank rows", () => {
    const book = XLSX.utils.book_new();
    const scope = XLSX.utils.aoa_to_sheet([["Page", "Hours"], ["Home", 4], [], ["Blog", 2]]);
    scope.C2 = { t: "n", f: "B2*2", v: 8 };
    scope["!ref"] = "A1:C4";
    XLSX.utils.book_append_sheet(book, scope, "Scope");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Launch", "2027-03-01"]]), "Dates");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Empty");
    const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    expect(looksLikeWorkbook(bytes, "xlsx")).toBe(true);
    expect(spreadsheetText(bytes)).toBe(
      ["## Sheet: Scope", "Page,Hours,", "Home,4,8", "Blog,2,", "", "## Sheet: Dates", "Launch,2027-03-01"].join("\n"),
    );
    // Text renamed .xlsx is not a workbook (SheetJS would happily read it as one).
    expect(looksLikeWorkbook(new TextEncoder().encode("Page,Hours"), "xlsx")).toBe(false);
    expect(looksLikeWorkbook(bytes, "xls")).toBe(false);
  });

  test("a catalog line is sized by the catalog; a custom line is clamped and left to confirm", () => {
    const lines = linesFromDraft(DRAFT, "wordpress");
    const cat = lines.find((l) => l.catalog_id === ROW.id)!;
    expect(cat).toMatchObject({
      title: ROW.name,
      base_hours: ROW.base_hours, // not Esther's 999, nor her unbacked 50
      responsible: ROW.responsible, // the catalog's role, not hers
      level: ROW.level,
      quantity: 3,
      esther_note: "The three pages they listed.",
    });
    const custom = lines.find((l) => l.title.startsWith("Cake order form"))!;
    expect(custom).toMatchObject({ catalog_id: null, base_hours: 7.5, tier: "advanced", hours_confirmed: false });
    expect(custom.hours).toBe(11.25); // 7.5 × 1.5
  });

  test("an id the platform doesn't have becomes a custom line; blank titles and wild numbers are tamed", () => {
    const lines = linesFromDraft(
      {
        ...DRAFT,
        lines: [
          { ...DRAFT.lines[1], catalog_id: 999_999, title: "Made-up row", base_hours: 5000, quantity: 0 },
          { ...DRAFT.lines[1], title: "   ", note: "dropped" },
        ],
      },
      "wordpress",
    );
    const made = lines.find((l) => l.title === "Made-up row")!;
    expect(made).toMatchObject({ catalog_id: null, base_hours: 400, quantity: 1, hours_confirmed: false });
    expect(lines.some((l) => l.esther_note === "dropped")).toBe(false);
  });

  test("PM and QA are added like Before you send's fixes — unless a line of that role exists", () => {
    const lines = linesFromDraft(DRAFT, "wordpress");
    const pm = lines.find((l) => l.responsible === "Project Manager")!;
    const qa = lines.find((l) => l.responsible === "QA Tester")!;
    expect(pm).toMatchObject({ title: "Project management", hours_confirmed: true });
    expect(qa).toMatchObject({ title: "QA & testing", hours_confirmed: true });
    const build = ROW.base_hours * 3 + 7.5 * 1.5;
    expect(pm.base_hours).toBe(Math.max(1, Math.round(build * 0.1 * 2) / 2));
    expect(qa.base_hours).toBe(Math.max(1, Math.round(build * 0.2 * 2) / 2));

    const withQa = linesFromDraft(
      { ...DRAFT, lines: [...DRAFT.lines, { ...DRAFT.lines[1], title: "Payment testing", responsible: "QA Tester" }] },
      "wordpress",
    );
    expect(withQa.filter((l) => l.responsible === "QA Tester")).toHaveLength(1);
  });

  test("requirements no line covers are reported; answers map onto the schedule and context", () => {
    expect(uncoveredRequirements(SCAN, DRAFT)).toEqual(["R3"]);

    const plan = schedulePlanFromAnswers(ANSWERS);
    expect(plan).toMatchObject({
      strategy: "efficient",
      start_date: "2026-12-01",
      hard_deadline: null, // not a date
      review_days: 30, // clamped
      blackout: false,
      blackout_notes: null, // only with a blackout
    });

    const meta = { file_name: "brief.txt", drafted_at: "", summary: "", requirements: [], uncovered: [], open_questions: [] };
    const ctx = contextFromAnswers(ANSWERS, DRAFT, meta);
    expect(ctx).toMatchObject({
      is_redesign: true,
      current_url: "https://example.com",
      regulated_industry: false,
      regulated_type: undefined, // not regulated → no type
      assumptions: DRAFT.assumptions,
    });
    expect(ctx.esther?.file_name).toBe("brief.txt");
  });
});

test.describe("routes (live, no API key — nothing is billed)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "once"));

  test("signed out is refused", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/esther")).status()).toBe(401);
    expect((await anon.post("/api/esther/scan", { multipart: { text: "x".repeat(50) } })).status()).toBe(401);
    await anon.dispose();
  });

  test("documents are checked before anything is sent", async ({ page }) => {
    await page.goto("/dashboard");
    const post = (multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) =>
      page.request.post("/api/esther/scan", { multipart });
    const none = await post({ note: "hi" });
    expect(none.status()).toBe(400);
    const wrongType = await post({ file: { name: "x.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") } });
    expect((await wrongType.json()).code).toBe("bad_input");
    const fakePdf = await post({ file: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") } });
    expect((await fakePdf.json()).code).toBe("unreadable");
    const fakeXlsx = await post({ file: { name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("Page,Hours,Home,4,".repeat(10)) } });
    expect((await fakeXlsx.json()).code).toBe("unreadable");
    const tiny = await post({ text: "too short" });
    expect((await tiny.json()).code).toBe("unreadable");
    const big = await post({ file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.alloc(5 * 1024 * 1024, 97) } });
    expect(big.status()).toBe(413);

    // A good document reaches the Claude step; with no key it stops there.
    const status = await (await page.request.get("/api/esther")).json();
    if (!status.ready) {
      const ok = await post({ text: "We need a five page bakery website with an online cake order form." });
      expect(ok.status()).toBe(503);
      expect((await ok.json()).code).toBe("not_configured");
    }
  });
});

// ── The UI, with Esther mocked ─────────────────────────────────────────────

const e = env();
const sbUrl = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const sbKey = e.SUPABASE_SERVICE_ROLE_KEY || "";

async function mockEsther(page: Page) {
  await page.route("**/api/esther", (r) => r.fulfill({ json: { ready: true } }));
  await page.route("**/api/esther/scan", async (r) => {
    await new Promise((res) => setTimeout(res, 1500)); // long enough to see her work
    await r.fulfill({ json: { scan: SCAN, fileName: "bakery-brief.txt" } });
  });
  await page.route("**/api/esther/draft", async (r) => {
    // The confirmed answers travel with the request.
    const body = r.request().postData() ?? "";
    expect(body).toContain('"review_days":5');
    await new Promise((res) => setTimeout(res, 1500));
    await r.fulfill({ json: { draft: DRAFT } });
  });
  await page.route("**/api/zoho/accounts**", (r) =>
    r.fulfill({
      json: r.request().url().includes("contactsOf")
        ? { contacts: [] }
        : {
            accounts: [
              { id: "e2e-esther-acc", name: "Sunrise Bakery", phone: null, website: null, city: null, owner: null, webUrl: null, deals: [] },
            ],
          },
    }),
  );
}

test("Esther: drop a brief, answer what's missing, land on a reviewable estimate", async ({ page }) => {
  test.skip(!sbUrl || !sbKey, "needs the live database");
  test.setTimeout(120_000);
  await mockEsther(page);
  await page.goto("/proposals");
  await waitForApp(page);

  await page.getByRole("button", { name: /^new estimate$/i }).first().click();
  const chooser = page.getByTestId("estimate-chooser");
  await chooser.getByRole("button", { name: /let esther estimate/i }).click();

  const flow = page.getByTestId("esther-flow");
  const read = flow.getByRole("button", { name: /let esther read it/i });
  await expect(read).toBeDisabled();
  await flow.getByTestId("esther-file-input").setInputFiles({
    name: "bakery-brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Sunrise Bakery wants a new WordPress site to replace our old site, with order cakes online."),
  });
  await expect(flow.getByText("bakery-brief.txt")).toBeVisible();
  await read.click();

  // Esther at work.
  await expect(flow.getByText("Esther is reading the document")).toBeVisible();
  await expect(flow.getByRole("button", { name: /^stop$/i })).toBeVisible();

  // A conversation: Esther says what she read, then asks one thing at a time.
  const step = flow.getByTestId("esther-step");
  const at = (id: string) => expect(step).toHaveAttribute("data-step", id, { timeout: 15_000 });
  const next = flow.getByRole("button", { name: /^(next|let's go|skip|done)$/i });
  await at("intro");
  await expect(flow.getByText("I've read", { exact: false })).toBeVisible();
  // name, client, the 4 missing, the 2 guessed (regulated, goal) and her Q1; found answers are not asked
  await expect(flow.getByText(/I have 9 quick questions/)).toBeVisible();
  await next.click();

  await at("name");
  await next.click();

  // Client from Zoho (searching for the name Esther found); waits for it.
  await at("client");
  if (await flow.getByTestId("esther-client").count()) {
    await expect(next).toBeDisabled();
    await flow.getByRole("button", { name: /find “sunrise bakery” in zoho/i }).click();
    const lookup = page.getByRole("dialog", { name: /find the client in zoho/i });
    await expect(lookup.getByRole("textbox")).toHaveValue("Sunrise Bakery");
    await lookup.getByText("Sunrise Bakery").first().click();
    await page.getByRole("button", { name: /use the company only/i }).click();
  }
  await next.click();

  // Not in the document → asked, and Next waits for an answer. A tap that
  // answers it moves on by itself.
  await at("start_date");
  await expect(flow.getByText("I couldn't find this in the document")).toBeVisible();
  await expect(next).toBeDisabled();
  await flow.getByRole("radio", { name: /as soon as it's approved/i }).click();
  await at("hard_deadline");
  await flow.getByRole("radio", { name: /no fixed deadline/i }).click();
  await at("review_days");
  await flow.getByRole("radio", { name: "5 days" }).click();
  await at("blackout");
  await flow.getByRole("radio", { name: "No" }).click();

  // A guess is pre-answered: check it and go on.
  await at("regulated_industry");
  await expect(flow.getByText("This is my guess — please check it")).toBeVisible();
  await expect(flow.getByRole("radio", { name: "No" })).toHaveAttribute("aria-checked", "true");
  await next.click();
  await at("primary_goal");
  await next.click();

  // Esther's own question: her guess in one tap.
  await at("q:Q1");
  await flow.getByRole("button", { name: /use my guess/i }).click();

  // The review: everything she'll use, found answers included.
  await at("review");
  const build = flow.getByRole("button", { name: /build my estimate/i });
  await expect(flow.getByTestId("esther-missing")).toContainText("All set");
  const review = flow.getByTestId("esther-review");
  await expect(review.locator('[data-review="is_redesign"]')).toContainText("Yes — https://example.com");
  await expect(review.locator('[data-review="review_days"]')).toContainText("5 working days");
  await expect(review.locator('[data-review="q:Q1"]')).toContainText("Up to 10");

  // Changing a found answer shows the client's words, then comes back here.
  await review.locator('[data-review="is_redesign"]').click();
  await at("is_redesign");
  await expect(flow.getByText("“replace our old site”")).toBeVisible();
  await flow.getByRole("button", { name: /^done$/i }).click();
  await at("review");

  await build.click();
  await expect(flow.getByText("Esther is drafting your estimate")).toBeVisible();

  // The estimate opens, ready to review.
  await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const id = page.url().split("/").pop()!;
  try {
    const card = page.getByTestId("esther-draft-card");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText("bakery-brief.txt");
    await expect(card.getByTestId("esther-to-confirm")).toHaveText("Confirm hours on 1 new task");
    // Its list jumps to the line that needs the developer.
    await card.getByTestId("esther-to-confirm").click();
    await card.getByRole("button", { name: /cake order form with flavour options/i }).click();
    const target = page
      .locator('[id^="line-"]')
      .filter({ has: page.locator('input[value="Cake order form with flavour options"]') });
    await expect(target).toBeInViewport();
    await expect(card).toContainText("Sync orders to their POS"); // not priced
    await expect(card).toContainText("Which POS do they use?");
    await expect(card.getByTestId("esther-based-on")).toContainText("no past approved estimates"); // mock sent no history

    // Esther's lines are marked, and say why.
    const tags = page.getByTestId("esther-line-tag");
    await expect(tags).toHaveCount(4); // 2 drafted + PM + QA
    await tags.first().click();
    await expect(page.getByTestId("esther-line-note").first()).toContainText("Why Esther added this");

    // Saved as drafted: context, schedule and lines are in the database.
    const row = await (
      await fetch(`${sbUrl}/rest/v1/proposals?id=eq.${id}&select=*`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      })
    ).json();
    expect(row[0].line_items).toHaveLength(4);
    expect(row[0].schedule_plan).toMatchObject({ review_days: 5, blackout: false, start_date: null });
    expect(row[0].context.esther.uncovered).toEqual(["R3"]);
    expect(row[0].context.assumptions).toEqual(DRAFT.assumptions);
    expect(row[0].discovery).toBeNull();
  } finally {
    await fetch(`${sbUrl}/rest/v1/proposals?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
  }
});

test("Esther not set up: her card says so and can't be chosen", async ({ page }) => {
  await page.route("**/api/esther", (r) => r.fulfill({ json: { ready: false } }));
  await page.goto("/proposals");
  await waitForApp(page);
  await page.getByRole("button", { name: /^new estimate$/i }).first().click();
  const card = page.getByTestId("estimate-chooser").getByRole("button", { name: /let esther estimate/i });
  await expect(card).toBeDisabled();
  await expect(card).toContainText("Not set up yet");
  await page.getByTestId("estimate-chooser").getByRole("button", { name: /build it myself/i }).click();
  await expect(page.getByRole("dialog", { name: "New estimate" }).getByText("How do you want to scope it?")).toBeVisible();
});

test("Esther's face blinks — and holds still for reduced motion", async ({ page }) => {
  await page.route("**/api/esther", (r) => r.fulfill({ json: { ready: true } }));
  const open = async () => {
    await page.goto("/proposals");
    await waitForApp(page);
    await page.getByRole("button", { name: /^new estimate$/i }).first().click();
    const face = page.getByTestId("estimate-chooser").getByTestId("esther-face");
    await expect(face).toBeVisible();
    // Every stacked frame actually loaded (a 404 would show as a gap mid-blink).
    await expect
      .poll(() => face.locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
      .toBe(true);
    // Record which frame shows, every 20 ms, across one blink cycle (~4 s).
    return face.evaluate(
      (el) =>
        new Promise<string[]>((done) => {
          const seen = new Set<string>();
          const t = setInterval(() => seen.add(el.getAttribute("data-frame") ?? ""), 20);
          setTimeout(() => (clearInterval(t), done([...seen])), 4500);
        }),
    );
  };
  expect((await open()).sort()).toEqual(["base", "blink-1", "blink-2"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await open()).toEqual(["base"]);
});

test("the dropzone takes Excel and CSV, and names what it takes when it can't", async ({ page }) => {
  await page.route("**/api/esther", (r) => r.fulfill({ json: { ready: true } }));
  await page.goto("/proposals");
  await waitForApp(page);
  await page.getByRole("button", { name: /^new estimate$/i }).first().click();
  await page.getByTestId("estimate-chooser").getByRole("button", { name: /let esther estimate/i }).click();
  const flow = page.getByTestId("esther-flow");
  await expect(flow).toContainText("PDF, Word, Excel, CSV or text");
  const input = flow.getByTestId("esther-file-input");
  const read = flow.getByRole("button", { name: /let esther read it/i });
  for (const name of ["scope.xlsx", "scope.csv"]) {
    await input.setInputFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from("Page,Hours") });
    await expect(read).toBeEnabled();
    await expect(flow.getByRole("alert")).toHaveCount(0);
    await expect(flow.getByText(name)).toBeVisible();
    await flow.getByRole("button", { name: /remove|choose a different file/i }).first().click();
  }
  await input.setInputFiles({ name: "x.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(flow.getByRole("alert")).toContainText("Excel (.xlsx), CSV");
});
