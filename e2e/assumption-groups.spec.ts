import { expect, test } from "@playwright/test";

import { ASSUMPTION_GROUPS, groupAssumptions, groupOf, toStored, withoutMarker } from "../lib/estimator/assumption-groups";
import { E2E_PREFIX, env, waitForApp } from "./helpers";

/** Scope assumptions are shown grouped (display only). Pure. */
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

test("each assumption lands in the group a reader would look for", () => {
  // From a real Esther draft (Sight Center, 2026-11-24).
  expect(groupOf("The client will supply all text, numbers, images and the 2025 Form 990 file before work starts.")).toBe("client");
  expect(groupOf("Our team will enter the four client-written blog posts into the website (assumed, not confirmed).")).toBe("confirm");
  expect(groupOf("The Diabetes Prevention events are assumed to be typed in by hand today, not pulled from an events tool.")).toBe("confirm");
  expect(groupOf("Updating the Financials page covers numbers only; changing charts or visuals would be scoped separately, as the document states.")).toBe("excluded");
  expect(groupOf("Work is done on the existing WordPress site; no redesign, new pages or new copywriting are included.")).toBe("excluded");
  expect(groupOf("Not included: Google Business Profile setup, ongoing SEO or ads.")).toBe("excluded");
  expect(groupOf("The estimate includes one round of client revisions after the changes are made.")).toBe("included");
  expect(groupOf("Card deposits are taken through Stripe. The client opens their own Stripe account and pays its fees.")).toBe("included");
});

test("groups come in a fixed order, empty ones are dropped, and the 'not confirmed' note moves to the heading", () => {
  const g = groupAssumptions([
    "Not included: hosting.",
    "Emails go to ops@example.org (assumed, not confirmed); no confirmation email.",
    "One round of revisions.",
    "  ",
  ]);
  expect(g.map((x) => x.id)).toEqual(["included", "confirm", "excluded"]);
  expect(g[1].items).toEqual(["Emails go to ops@example.org; no confirmation email."]);
  expect(groupAssumptions([])).toEqual([]);
});

test("a line stays in the group it was put in, whatever its wording", () => {
  const texts = [
    "Hosting on the client's plan",
    "The client will supply all photos",
    "No redesign is included",
    "Emails go to one inbox (assumed, not confirmed)",
    "Not included: ongoing SEO",
  ];
  for (const { id } of ASSUMPTION_GROUPS) {
    for (const t of texts) {
      const stored = toStored(id, t);
      expect(groupOf(stored), `${id} ← "${t}" stored as "${stored}"`).toBe(id);
    }
  }
  // Wording that already lands there is stored as typed.
  expect(toStored("client", "The client will supply all photos")).toBe("The client will supply all photos");
  // A marker reads naturally, and is hidden under its own heading.
  expect(toStored("excluded", "Hosting on the client's plan")).toBe("Not included: Hosting on the client's plan");
  expect(withoutMarker("Not included: hosting")).toBe("Hosting");
  expect(toStored("included", "Emails go to one inbox (assumed, not confirmed)")).toBe("Included: Emails go to one inbox");
});

const SIGHT_CENTER = [
  "The client will supply all text, numbers, images, the 2027 game date and the 2025 Form 990 file before work starts.",
  "Our team will enter the four client-written blog posts into the website (assumed, not confirmed).",
  "Eye Screening Request Form submissions will be emailed to one inbox (assumed, not confirmed); no confirmation email goes to the person filling it in.",
  "The Diabetes Prevention events are assumed to be typed in by hand today, not pulled from an events tool.",
  "Updating the Financials page covers numbers only; changing charts or visuals would be scoped separately, as the document states.",
  "The estimate includes one round of client revisions after the changes are made.",
  "Work is done on the existing WordPress site; no redesign, new pages or new copywriting are included.",
];

test("Review → Client preview shows the assumptions grouped", async ({ page }) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const made = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: `${E2E_PREFIX} assumption groups ${Math.random().toString(36).slice(2, 6)}`,
      platform: "wordpress",
      context: { assumptions: SIGHT_CENTER },
    }),
  });
  const id = (await made.json())?.[0]?.id;
  expect(id, "fixture estimate").toBeTruthy();
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^review/i }).click();
    const groups = page.getByTestId("assumption-groups");
    await expect(groups).toBeVisible({ timeout: 20_000 });
    const order = await groups.locator("section").evaluateAll((s) => s.map((x) => x.getAttribute("data-group")));
    expect(order).toEqual(["included", "client", "confirm", "excluded"]);
    const confirm = groups.locator('[data-group="confirm"]');
    await expect(confirm.locator("li")).toHaveCount(3);
    await expect(confirm).not.toContainText("assumed, not confirmed"); // the heading says it
    await expect(groups.locator('[data-group="excluded"] li')).toHaveCount(2);

    // Editing happens in the same groups, one row per assumption.
    await page.getByRole("button", { name: /^edit$/i }).click();
    const editor = page.getByTestId("assumption-editor");
    await expect(editor.locator('[data-group="confirm"] textarea')).toHaveCount(3);
    await expect(editor.locator("textarea").first()).toBeFocused();

    // "Add" under Not included: the line stays there, whatever its wording.
    const excluded = editor.locator('[data-group="excluded"]');
    await excluded.getByRole("button", { name: /^add$/i }).click();
    await page.keyboard.type("Hosting on the client's own plan");
    // Enter starts a new line; Backspace on an empty one removes it.
    await page.keyboard.press("Enter");
    await expect(excluded.locator("textarea")).toHaveCount(4);
    await page.keyboard.press("Backspace");
    await expect(excluded.locator("textarea")).toHaveCount(3);
    // Pasting a list adds a row per line.
    const included = editor.locator('[data-group="included"]');
    await included.getByRole("button", { name: /^add$/i }).click();
    await page.evaluate(() => {
      const el = document.activeElement as HTMLTextAreaElement;
      const data = new DataTransfer();
      data.setData("text", "Two rounds of design changes\nTraining video for staff");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(included.locator("textarea")).toHaveCount(3);
    await editor.getByRole("button", { name: /save assumptions/i }).click();

    await expect(groups.locator('[data-group="excluded"] li')).toHaveCount(3);
    await expect(groups.locator('[data-group="excluded"]')).toContainText("Hosting on the client's own plan");
    await expect(groups.locator('[data-group="included"] li')).toHaveCount(3);
    const saved = (await (await fetch(`${url}/rest/v1/proposals?id=eq.${id}&select=context`, { headers: h })).json())[0]
      .context.assumptions as string[];
    expect(saved).toContain("Not included: Hosting on the client's own plan"); // marker keeps its group
    expect(saved).toContain(SIGHT_CENTER[1]); // untouched lines are saved exactly as they were
    expect(saved).toHaveLength(SIGHT_CENTER.length + 3);
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
