import { expect, test } from "@playwright/test";

import { analyzeDiscovery } from "../lib/discovery";
import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import { countUnanswered, unansweredBySection } from "../lib/discovery/questions";
import type { DiscoveryProject } from "../types/discovery.types";
import { E2E_PREFIX, env, waitForApp } from "./helpers";

/**
 * Questionnaire sections 3–8 can be switched off for a job that doesn't
 * include them: their required questions stop counting and their hours leave
 * the estimate. Answers are kept, so switching back restores the estimate.
 */
const base = (): DiscoveryProject => ({
  ...createEmptyDiscoveryProject(),
  id: "t",
  platform: "wordpress",
  total_pages: 12,
  unique_templates: 4,
  copy_ready: false, // a risk flag that only Content (4) can raise
  keyword_research_included: true,
  needs_cms_training: true,
  project_start_date: "2026-11-02",
  created_at: "",
  updated_at: "",
});

test.describe("pure", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  test("a skipped section's phase, hours, required gaps and risk flags all go", () => {
    const on = analyzeDiscovery(base());
    const off = analyzeDiscovery({ ...base(), skipped_sections: [3, 4, 6, 8] });

    const ids = (r: typeof on) => r.estimate.phases.map((p) => p.id);
    expect(ids(on)).toEqual(expect.arrayContaining(["design", "content", "seo"]));
    expect(ids(off)).not.toContain("design");
    expect(ids(off)).not.toContain("content");
    expect(ids(off)).not.toContain("seo");
    expect(off.timeline.phases.map((p) => p.id)).not.toContain("design");
    expect(off.timeline.milestones.map((m) => m.id)).not.toContain("design_approved");
    // Section 8's extras (CMS training) are gone from Launch, its base stays.
    const launch = off.estimate.phases.find((p) => p.id === "launch")!;
    expect(launch.tasks.map((t) => t.name)).not.toContain("CMS training session");
    expect(launch.tasks.length).toBeGreaterThan(0);

    expect(off.estimate.total.mid).toBeLessThan(on.estimate.total.mid);
    expect(off.timeline.totalBusinessDays).toBeLessThan(on.timeline.totalBusinessDays);
    expect(on.risk.flags.map((f) => f.label)).toContain("Client copy not ready");
    expect(off.risk.flags.map((f) => f.label)).not.toContain("Client copy not ready");
    expect(off.estimate.assumptions.join(" ")).toMatch(/Not in this project: Design & Brand, Content, SEO/);
  });

  test("required questions in a skipped section stop counting", () => {
    const p = { ...base(), project_start_date: "" }; // section 7's required date
    expect(unansweredBySection(p)[7]).toBe(1);
    const off = { ...p, skipped_sections: [7] };
    expect(unansweredBySection(off)[7]).toBeUndefined();
    expect(countUnanswered(off)).toBe(countUnanswered(p) - 1);
  });

  test("nothing skipped, or switched back on, is exactly the original", () => {
    const strip = (r: ReturnType<typeof analyzeDiscovery>) => JSON.stringify(r);
    const original = strip(analyzeDiscovery(base()));
    expect(strip(analyzeDiscovery({ ...base(), skipped_sections: [] }))).toBe(original);
    // Section 1/2 can't be skipped even if the data says so.
    expect(strip(analyzeDiscovery({ ...base(), skipped_sections: [1, 2] }))).toBe(original);
  });
});

test("a section can be switched off from the questionnaire, and back on", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "desktop + phone cover both rails");
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "needs the live database");
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const id = (await (await fetch(`${url}/rest/v1/proposals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      title: `${E2E_PREFIX} skip sections ${info.project.name}`,
      platform: "wordpress", status: "draft", requirements_unclear: false, addons: {}, line_items: [],
      discovery: { ...base(), id: undefined },
    }),
  })).json())[0].id as string;
  const read = async () =>
    (await (await fetch(`${url}/rest/v1/proposals?id=eq.${id}&select=discovery`, { headers: h })).json())[0].discovery;
  try {
    await page.goto(`/proposals/${id}`);
    await waitForApp(page);
    await page.getByRole("tab", { name: /^scope/i }).click();
    await page.getByRole("button", { name: /^Section 6:/ }).click();
    await expect(page.getByText("On-Page SEO Included?")).toBeVisible();

    await page.getByRole("checkbox", { name: /include this section/i }).click();
    await expect(page.getByRole("button", { name: /^Section 6: .*\(left out\)/ })).toBeVisible();
    await expect(page.getByText("On-Page SEO Included?")).toHaveCount(0);
    await expect.poll(async () => (await read()).skipped_sections, { timeout: 10_000 }).toEqual([6]);

    await page.getByRole("checkbox", { name: /include this section/i }).click();
    await expect(page.getByText("On-Page SEO Included?")).toBeVisible();
    await expect.poll(async () => (await read()).skipped_sections, { timeout: 10_000 }).toEqual([]);

    // Sections 1–2 have no switch.
    await page.getByRole("button", { name: /^Section 2:/ }).click();
    await expect(page.getByRole("checkbox", { name: /include this section/i })).toHaveCount(0);
  } finally {
    await fetch(`${url}/rest/v1/proposals?id=eq.${id}`, { method: "DELETE", headers: h });
  }
});
