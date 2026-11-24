import { expect, test, type Page } from "@playwright/test";

import { apiSchema } from "../lib/esther/estimate/api-schema";
import {
  pickReferences,
  referenceExtractSchema,
  referenceFromExtract,
  referencesPrompt,
  type EstherReference,
  type ReferenceExtract,
} from "../lib/esther/estimate/references";
import { env, waitForApp } from "./helpers";

/**
 * Esther's uploaded past estimates (0055). The pure rules — what is kept from
 * Claude's reading of a file, which uploads a draft sees, what the prompt says
 * — and the Settings card with the route mocked (nothing is billed).
 */

const EXTRACT: ReferenceExtract = {
  is_estimate: true,
  title: "Sunrise Bakery WordPress site",
  platform: "wordpress",
  summary: "A five-page site for Sunrise Bakery with online cake orders. Contact jane@sunrise.com.",
  client_names: ["Sunrise Bakery", "Jane Doe"],
  lines: [
    { title: "Homepage design for Sunrise Bakery", phase: "Design", hours: 8, quantity: 1, role: "Creative" },
    { title: "Cake order form (Jane Doe to approve)", phase: "Development", hours: 12.13, quantity: 1, role: "IT" },
    { title: "Subtotal", phase: "", hours: 0, quantity: 1, role: "" },
    { title: "  ", phase: "", hours: 4, quantity: 1, role: "" },
    { title: "Call 555-123-4567 to launch, see www.sunrise.com", phase: "Launch", hours: 99999, quantity: 0, role: "" },
  ],
};

const ref = (over: Partial<EstherReference>): EstherReference => ({
  id: crypto.randomUUID(),
  title: "t",
  file_name: "f.xlsx",
  platform: "wordpress",
  summary: "",
  lines: [{ title: "Homepage", phase: "", hours: 4, quantity: 1, role: "" }],
  total_hours: 4,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

test.describe("rules (pure)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  test("what is kept: no names, emails, sites or phones; sane hours; empty and total rows dropped", () => {
    const row = referenceFromExtract(EXTRACT, "old-quote.xlsx")!;
    const all = JSON.stringify(row);
    for (const leak of ["Sunrise", "Jane", "jane@", "555-123", "www.sunrise"]) expect(all, leak).not.toContain(leak);
    expect(row.title).toBe("[client] WordPress site");
    expect(row.lines.map((l) => l.title)).toEqual([
      "Homepage design for [client]",
      "Cake order form ([client] to approve)",
      "Call [phone] to launch, see [website]",
    ]);
    expect(row.lines.map((l) => l.hours)).toEqual([8, 12.25, 2000]); // quarter hours, capped
    expect(row.lines[2].quantity).toBe(1);
    expect(row.total_hours).toBe(2020.25);
    expect(row.platform).toBe("wordpress");
    expect(row.file_name).toBe("old-quote.xlsx");
  });

  test("a file that isn't an estimate, or has no houred lines, is not stored", () => {
    expect(referenceFromExtract({ ...EXTRACT, is_estimate: false }, "x.docx")).toBeNull();
    expect(referenceFromExtract({ ...EXTRACT, lines: [EXTRACT.lines[2]] }, "x.docx")).toBeNull();
    expect(referenceFromExtract({ ...EXTRACT, platform: "unknown" }, "x.docx")!.platform).toBeNull();
  });

  test("a draft sees the 3 closest uploads on its platform (or none stated)", () => {
    const shop = ref({ platform: "shopify", lines: [{ title: "Product catalog import", phase: "", hours: 9, quantity: 1, role: "" }] });
    const blog = ref({ lines: [{ title: "Blog setup and categories", phase: "", hours: 5, quantity: 1, role: "" }] });
    const store = ref({ platform: null, summary: "online store with cake orders", created_at: "2025-01-01T00:00:00Z" });
    const plain = [1, 2, 3].map((i) => ref({ created_at: `2026-0${i}-01T00:00:00Z` }));
    const picked = pickReferences([shop, blog, store, ...plain], "wordpress", "Cake orders and a blog");
    expect(picked).toHaveLength(3);
    expect(picked).not.toContain(shop); // other platform
    expect(picked.slice(0, 2)).toEqual(expect.arrayContaining([blog, store])); // shared words beat newer
    expect(pickReferences([], "wordpress", "x")).toEqual([]);
  });

  test("the prompt numbers uploads and never shows their titles", () => {
    const r = ref({ title: "Secret Client Co", summary: "A site.", lines: [{ title: "Homepage", phase: "Pages", hours: 4, quantity: 2, role: "IT" }] });
    const p = referencesPrompt([r]);
    expect(p).toContain("Uploaded estimate 1 — wordpress, 1 lines, 4 h");
    expect(p).toContain("- Homepage [Pages] · 4 h (× 2) · IT");
    expect(p).not.toContain("Secret Client");
    expect(referencesPrompt([])).toBe("");
  });

  test("the schema sent to Claude has no unions", () => {
    expect(JSON.stringify(apiSchema(referenceExtractSchema))).not.toMatch(/anyOf|"null"/);
  });
});

test("routes refuse a signed-out caller", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/esther/references")).status()).toBe(401);
  expect((await anon.post("/api/esther/references", { multipart: { text: "x".repeat(50) } })).status()).toBe(401);
  expect((await anon.delete(`/api/esther/references?id=${crypto.randomUUID()}`)).status()).toBe(401);
  await anon.dispose();
});

test("a manager sees the list read-only; the server refuses their upload and delete", async ({ page }) => {
  await page.route("**/api/esther/references", (r) =>
    r.request().method() === "GET" ? r.fulfill({ json: { references: [ref({ title: "WordPress bakery site" })] } }) : r.fallback(),
  );
  await page.goto("/settings?tab=workspace");
  await waitForApp(page);
  const card = page.getByTestId("esther-references");
  await expect(card).toContainText("Only admins can upload or delete past estimates.");
  await expect(card).toContainText("WordPress bakery site");
  await expect(card.getByRole("button", { name: /upload past estimates/i })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /delete/i })).toHaveCount(0);
  // The real routes (not mocked): refused before any file is read or Claude is called.
  const up = await page.request.post("/api/esther/references", { multipart: { text: "x".repeat(80) } });
  expect(up.status()).toBe(403);
  expect((await page.request.delete(`/api/esther/references?id=${crypto.randomUUID()}`)).status()).toBe(403);
});

// A throwaway "[E2E]" admin (the suite's bot is a manager). Deleted afterwards.
const made: { id: string; email: string }[] = [];
test.afterEach(async () => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  for (const u of made.splice(0)) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
    await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(u.email)}`, { method: "DELETE", headers: h });
  }
});

async function signInAsNewAdmin(page: Page) {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-refadmin-${run}@example.test`;
  const password = `P-${run}-x9!`;
  await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
    method: "POST",
    headers: { ...h, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ email, role: "admin" }]),
  });
  const u = await (
    await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, password, email_confirm: true }) })
  ).json();
  expect(u?.id, "admin fixture").toBeTruthy();
  made.push({ id: u.id, email });
  await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ name: `[E2E] refadmin ${run}`, role: "admin", confirmed_at: "2026-01-01T00:00:00Z" }),
  });
  // No welcome dialog / tour hint / 2FA toast over the page.
  await fetch(`${url}/rest/v1/tour_progress?on_conflict=profile_id,tour_id`, {
    method: "POST",
    headers: { ...h, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(
      ["intro-hint", "2fa-reminder"].map((tour_id) => ({ profile_id: u.id, tour_id, version: 1000, status: "dismissed" })),
    ),
  });
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
  }, { timeout: 30_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test("an admin uploads past estimates, sees what Esther kept, deletes one", async ({ browser }) => {
  test.skip(!env().SUPABASE_SERVICE_ROLE_KEY, "no Supabase credentials");
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  try {
    await signInAsNewAdmin(page);
    let list: EstherReference[] = [];
    await page.route("**/api/esther/references**", async (r) => {
      const m = r.request().method();
      if (m === "GET") return r.fulfill({ json: { references: list } });
      if (m === "DELETE") {
        const id = new URL(r.request().url()).searchParams.get("id");
        list = list.filter((x) => x.id !== id);
        return r.fulfill({ json: { ok: true } });
      }
      await new Promise((d) => setTimeout(d, 400));
      const body = r.request().postDataBuffer()?.toString("latin1") ?? "";
      if (body.includes("not-an-estimate")) {
        return r.fulfill({ status: 422, json: { code: "unreadable", error: "Esther couldn't find tasks with hours in that file, so it wasn't added." } });
      }
      const added = ref({ title: "WordPress bakery site", lines: [{ title: "Homepage design", phase: "Design", hours: 8, quantity: 1, role: "Creative" }], total_hours: 8 });
      list = [added, ...list];
      return r.fulfill({ json: { reference: added } });
    });

    await page.goto("/settings?tab=workspace");
    await waitForApp(page);
    const card = page.getByTestId("esther-references");
    await expect(card).toContainText("No past estimates yet");
    await expect(card).not.toContainText("Only admins");

    await card.getByTestId("esther-references-input").setInputFiles([
      { name: "old-quote.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK") },
      { name: "notes.docx", mimeType: "application/octet-stream", buffer: Buffer.from("not-an-estimate") },
      { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") },
    ]);
    const jobs = card.getByTestId("esther-references-jobs");
    await expect(jobs.locator('[data-state="added"]')).toContainText("old-quote.xlsx — 1 lines · 8 h");
    await expect(jobs.locator('[data-state="failed"]').filter({ hasText: "notes.docx" })).toContainText("couldn't find tasks");
    await expect(jobs.locator('[data-state="failed"]').filter({ hasText: "photo.png" })).toContainText("Not a file Esther reads");

    const row = card.getByTestId("esther-references-list").locator("li").first();
    await expect(row).toContainText("WordPress bakery site");
    await row.locator("summary").click();
    await expect(row).toContainText("Homepage design");

    await row.getByRole("button", { name: /delete wordpress bakery site/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(card).toContainText("No past estimates yet");
  } finally {
    await ctx.close();
  }
});
