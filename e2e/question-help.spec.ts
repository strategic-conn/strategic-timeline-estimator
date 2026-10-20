import { expect, test } from "@playwright/test";

import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { QUESTION_HELP } from "../lib/discovery/question-help";
import { DISCOVERY_QUESTIONS } from "../lib/discovery/questions";
import { env, waitForApp } from "./helpers";

/**
 * Every guided-scoping question has a plain-English description behind its (i),
 * and the (i) opens by hover on a desktop and by tap on a phone.
 */
test("every question has a description", () => {
  const missing = DISCOVERY_QUESTIONS.filter((q) => !QUESTION_HELP[q.id]?.trim()).map((q) => q.id);
  expect(missing, `questions without help: ${missing.join(", ")}`).toEqual([]);
  // ...and none points at a question that no longer exists.
  const ids = new Set(DISCOVERY_QUESTIONS.map((q) => q.id));
  const stale = Object.keys(QUESTION_HELP).filter((k) => !ids.has(k as never));
  expect(stale, `help for unknown questions: ${stale.join(", ")}`).toEqual([]);
});

test("the (i) opens on hover with a mouse and on tap on a phone", async ({ page }, info) => {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "needs the live database");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const res = await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: "[E2E] question help",
      platform: "wordpress",
      status: "draft",
      requirements_unclear: false,
      addons: {},
      line_items: [],
      discovery: { ...createEmptyDiscoveryProject(), platform: "wordpress" },
    }),
  });
  const id = (await res.json())[0].id as string;
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^scope/i }).click();
    const info_ = page.getByRole("button", { name: "About Is this a redesign / rebuild?" });
    await expect(info_).toBeVisible();
    const panel = page.getByText(/already has a website we're replacing/);

    if (info.project.name === "mobile") {
      await info_.tap();
      await expect(panel).toBeVisible();
      // A second tap closes it — and stays closed. The tap's synthetic mouse
      // event used to re-open it about one time in ten.
      await info_.tap();
      await page.waitForTimeout(600);
      await expect(panel).toBeHidden();
    } else {
      await info_.hover();
      await expect(panel).toBeVisible();
      await page.mouse.move(0, 0);
      await expect(panel).toBeHidden();
      // A click pins it open, even after the mouse leaves.
      await info_.click();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
