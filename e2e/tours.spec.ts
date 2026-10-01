import { expect, test, type Page } from "@playwright/test";

import { checklistItems, checklistProgress, type ChecklistInput } from "../lib/tours/checklist";
import { TOUR_TARGETS } from "../lib/tours/ids";
import { env, hasHorizontalScroll, waitForApp } from "./helpers";

/**
 * Onboarding tours (docs/onboarding-tour-plan.md).
 *
 * Runs in all three projects (1280 / 768 / 375), as the suite's bot — a
 * MANAGER who joined before tours shipped, so it never gets the welcome dialog
 * or nudges. The newcomer flow uses a throwaway "[E2E]" member, made and
 * deleted here.
 *
 * What each page tour must do, at every width:
 *  - start from the ? menu and show at least one step;
 *  - keep every popover fully inside the viewport (a bottom/top sheet on a
 *    phone), and every highlighted element on screen;
 *  - write NOTHING except its own tour_progress row (plan §3.1);
 *  - not let the highlighted control be pressed.
 */

const KNOWN = new Set<string>(TOUR_TARGETS);

/** data-tour values on the page that aren't in TOUR_TARGETS (a typo'd anchor). */
async function unknownAnchors(page: Page): Promise<string[]> {
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("[data-tour]")].map((el) => el.getAttribute("data-tour") ?? ""),
  );
  return [...new Set(values)].filter((v) => !KNOWN.has(v));
}

/** Record writes that a tour must never cause. */
function watchWrites(page: Page) {
  const writes: string[] = [];
  let on = false;
  page.on("request", (r) => {
    if (!on) return;
    const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
    const u = r.url();
    if (u.includes("/rest/v1/tour_progress")) return; // the tour's own record
    if (/\/rest\/v1\/|\/storage\/v1\/|\/api\/zoho|\/api\/pbs|\/api\/users|\/api\/invites/.test(u)) {
      writes.push(`${m} ${u}`);
    }
  });
  return {
    start: () => {
      on = true;
    },
    stop: () => {
      on = false;
      return writes.splice(0);
    },
  };
}

async function inViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  const vp = page.viewportSize()!;
  expect(box, `${selector} has a box`).toBeTruthy();
  expect(box!.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${selector} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${selector} right edge`).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height, `${selector} bottom edge`).toBeLessThanOrEqual(vp.height + 1);
}

/**
 * Open the ? menu, start this page's tour, walk it to the end with Next.
 * Returns the number of steps shown.
 */
async function runPageTour(page: Page, expectTitle?: RegExp): Promise<number> {
  const help = page.getByRole("button", { name: /^Help and tours/ });
  await expect(help).toBeEnabled();
  await help.click();
  const item = page.getByRole("menuitem", { name: /^Tour: / });
  await expect(item, "this page offers a tour").toBeVisible();
  if (expectTitle) await expect(item).toHaveText(expectTitle);
  await item.click();

  const popover = page.locator(".driver-popover");
  await expect(popover).toBeVisible({ timeout: 15_000 });

  let steps = 0;
  for (let guard = 0; guard < 20; guard++) {
    steps++;
    await inViewport(page, ".driver-popover");
    if (await page.locator(".driver-active-element").count()) {
      const el = page.locator(".driver-active-element").first();
      const box = await el.boundingBox();
      expect(box && box.width > 0 && box.height > 0, "highlighted element is rendered").toBe(true);
    }
    const vp = page.viewportSize()!;
    if (vp.width < 768 && (await popover.getAttribute("data-anchored")) === "true") {
      await expect(popover, "phone: docked as a sheet").toHaveClass(/app-tour--sheet/);
      const box = await popover.boundingBox();
      expect(box!.width).toBeGreaterThan(vp.width - 40);
    }
    const next = page.locator(".driver-popover-next-btn");
    const label = (await next.textContent())?.trim();
    const title = await page.locator(".driver-popover-title").textContent();
    await next.click();
    if (label === "Done") break;
    await expect(page.locator(".driver-popover-title")).not.toHaveText(title ?? "", {
      timeout: 5_000,
    });
  }
  await expect(popover).toHaveCount(0);
  return steps;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await waitForApp(page);
}

/**
 * A link to a detail page, or null when the workspace has none. Waits for the
 * list (or its empty state) first: both render only after the store hydrates.
 */
async function firstLink(page: Page, ready: string, selector: string): Promise<string | null> {
  await page.locator(ready).first().waitFor({ timeout: 20_000 });
  const link = page.locator(selector).first();
  if (!(await link.count())) return null;
  return link.getAttribute("href");
}

test.describe("page tours (manager)", () => {
  test("every anchor is a known id — and the check catches a bad one", async ({ page }) => {
    for (const path of ["/dashboard", "/projects", "/calendar", "/gantt", "/workload", "/team", "/reports", "/proposals", "/settings"]) {
      await open(page, path);
      await page.waitForTimeout(800);
      expect(await unknownAnchors(page), `unknown data-tour ids on ${path}`).toEqual([]);
    }
    // Negative control: a typo'd anchor must be reported.
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.setAttribute("data-tour", "dashbord.kpis");
      document.body.appendChild(d);
    });
    expect(await unknownAnchors(page)).toEqual(["dashbord.kpis"]);
  });

  test("workspace pages: tours run, fit the screen, write nothing", async ({ page }) => {
    test.setTimeout(240_000);
    const w = watchWrites(page);
    const pages: [string, RegExp][] = [
      ["/dashboard", /Tour: Dashboard/],
      ["/projects", /Tour: Projects/],
      ["/calendar", /Tour: Calendar/],
      ["/gantt", /Tour: Timeline/],
      ["/workload", /Tour: Workload \(Team view\)/],
      ["/team", /Tour: Team & access/],
      ["/activity", /Tour: Activity/],
      ["/reports", /Tour: Reports/],
      ["/proposals", /Tour: Estimator/],
    ];
    for (const [path, title] of pages) {
      await open(page, path);
      w.start();
      const steps = await runPageTour(page, title);
      expect(steps, `${path} shows steps`).toBeGreaterThan(0);
      expect(w.stop(), `writes during the ${path} tour`).toEqual([]);
      expect(await hasHorizontalScroll(page), `${path} scrolls sideways`).toBe(false);
    }
  });

  test("a finished tour clears the dot and says 'Take it again'", async ({ page }) => {
    await open(page, "/reports");
    await runPageTour(page, /Tour: Reports/);
    await page.reload();
    await waitForApp(page);
    await page.waitForTimeout(2500); // the dot is recomputed after hydration
    const help = page.getByRole("button", { name: /^Help and tours/ });
    await expect(help).toHaveAttribute("aria-label", "Help and tours");
    await help.click();
    await expect(page.getByRole("menuitem", { name: /^Tour: Reports/ })).toContainText("Take it again");
    await page.keyboard.press("Escape");
  });

  test("project, board and estimate tours", async ({ page }) => {
    test.setTimeout(240_000);
    const w = watchWrites(page);

    await open(page, "/projects");
    const project = await firstLink(
      page,
      '[data-tour="projects.grid"], [data-tour="projects.empty"]',
      '[data-tour="projects.grid"] a[href^="/projects/"]',
    );
    test.skip(!project, "workspace has no projects");
    await open(page, project!);
    w.start();
    await runPageTour(page, /Tour: Project overview/);
    expect(w.stop()).toEqual([]);

    const sprint = await firstLink(
      page,
      '[data-tour="project.sprints"], [data-tour="project.empty"]',
      '[data-tour="project.sprints"] a[href*="/sprints/"]',
    );
    if (sprint) {
      await open(page, sprint);
      w.start();
      await runPageTour(page, /Tour: Task board/);
      expect(w.stop()).toEqual([]);

      // "n" opens New task on this board — but not while a tour is open.
      await page.getByRole("button", { name: /^Help and tours/ }).click();
      await page.getByRole("menuitem", { name: /^Tour: Task board/ }).click();
      await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press("n");
      await page.waitForTimeout(500);
      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.locator(".driver-popover")).toHaveCount(0);
      // Positive control: with the tour closed, the same key does open it.
      await page.keyboard.press("n");
      await expect(page.locator('[role="dialog"][data-state="open"]')).toHaveCount(1);
      await page.keyboard.press("Escape");
    }

    await open(page, "/proposals");
    await page
      .locator('[data-tour="estimator.board"], [data-tour="estimator.list"], [data-tour="estimator.empty"]')
      .first()
      .waitFor({ timeout: 20_000 });
    const estimate = await page
      .locator('main a[href^="/proposals/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")).find((h) => h && /^\/proposals\/[^/]+$/.test(h)));
    if (estimate) {
      await open(page, estimate);
      for (const [tab, title] of [
        [/^Setup$/, /Tour: Estimate: Setup/],
        [/^Scope & risk$/, /Tour: Estimate: Scope & risk/],
        [/^Line items/, /Tour: Estimate: Line items/],
        [/^Adjust$/, /Tour: Estimate: Adjust/],
        [/^Review$/, /Tour: Estimate: Review/],
      ] as const) {
        await page.getByRole("tab", { name: tab }).click();
        await page.waitForTimeout(300);
        w.start();
        await runPageTour(page, title);
        expect(w.stop(), `writes during the ${title} tour`).toEqual([]);
      }
    }
  });

  test("settings tabs each have a tour", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/settings");
    for (const [tab, title] of [
      ["Profile", /Tour: Settings: Profile/],
      ["Skills", /Tour: Settings: Skills/],
      ["Time off", /Tour: Settings: Time off/],
      ["Workspace", /Tour: Settings: Workspace/],
    ] as const) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(300);
      await runPageTour(page, title);
    }
  });

  test("the highlighted control cannot be pressed", async ({ page }) => {
    await open(page, "/projects");
    await page.getByRole("button", { name: /^Help and tours/ }).click();
    await page.getByRole("menuitem", { name: /^Tour: Projects/ }).click();
    await expect(page.locator(".driver-popover")).toBeVisible({ timeout: 15_000 });
    // The manager's first step is "New project".
    await expect(page.locator(".driver-popover-title")).toHaveText("Start a project");
    const box = await page.locator(".driver-active-element").boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: /new project|create project/i })).toHaveCount(0);
    await expect(page.locator(".driver-popover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".driver-popover")).toHaveCount(0);
  });

  test("an existing user gets no welcome dialog and no checklist", async ({ page }) => {
    await open(page, "/dashboard");
    await page.waitForTimeout(2500);
    await expect(page.getByRole("dialog", { name: /^Welcome/ })).toHaveCount(0);
    await expect(page.locator('[data-tour="dashboard.checklist"]')).toHaveCount(0);
  });
});

test.describe("newcomer", () => {
  const made: { id: string; email: string }[] = [];

  // A hook, not a finally: a timed-out test has its finally cut short.
  test.afterEach(async () => {
    const e = env();
    const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    for (const u of made.splice(0)) {
      await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: h });
      await fetch(`${url}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(u.email)}`, {
        method: "DELETE",
        headers: h,
      });
    }
  });

  test("welcome dialog → tour → checklist → Show me", async ({ browser }, info) => {
    test.setTimeout(150_000);
    const e = env();
    const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
    test.skip(!url || !key, "no Supabase credentials");
    const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

    const run = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const email = `e2e-tour-${info.project.name}-${run}@example.test`;
    const password = `P-${run}-x9!`;
    await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
      method: "POST",
      headers: { ...h, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ email, role: "member" }]),
    });
    const u = await (
      await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
    ).json();
    expect(u?.id).toBeTruthy();
    made.push({ id: u.id, email });
    await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ name: `[E2E] Tour ${run}`, role: "member", confirmed_at: new Date().toISOString() }),
    });
    const progress = async () =>
      (await (
        await fetch(`${url}/rest/v1/tour_progress?profile_id=eq.${u.id}&select=tour_id,status`, { headers: h })
      ).json()) as { tour_id: string; status: string }[];

    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: info.project.use.viewport ?? undefined,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
    });
    const p = await ctx.newPage();
    try {
      await p.goto("/login");
      await p.waitForFunction(() => {
        const form = document.querySelector("form");
        return !!form && Object.keys(form).some((k) => k.startsWith("__react"));
      }, { timeout: 30_000 });
      await p.locator("#email").fill(email);
      await p.locator("#password").fill(password);
      await p.getByRole("button", { name: /sign in/i }).click();
      await p.waitForURL(/\/dashboard/, { timeout: 30_000 });

      // ── Welcome dialog, once. ──
      const dialog = p.getByRole("dialog", { name: /^Welcome/ });
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await inViewport(p, '[role="dialog"]');
      await dialog.getByRole("button", { name: "Start the tour" }).click();
      await expect(p.locator(".driver-popover")).toBeVisible({ timeout: 15_000 });
      await expect(p.locator(".driver-popover-title")).toHaveText("Welcome to Timeline Estimator");
      // Walk it through.
      for (let i = 0; i < 10; i++) {
        await inViewport(p, ".driver-popover");
        const next = p.locator(".driver-popover-next-btn");
        const label = (await next.textContent())?.trim();
        const title = await p.locator(".driver-popover-title").textContent();
        await next.click();
        if (label === "Done") break;
        await expect(p.locator(".driver-popover-title")).not.toHaveText(title ?? "");
      }
      await expect(p.locator(".driver-popover")).toHaveCount(0);
      await expect.poll(async () => (await progress()).find((r) => r.tour_id === "welcome")?.status).toBe("completed");

      // Not again after a reload.
      await p.reload();
      await waitForApp(p);
      await p.waitForTimeout(2000);
      await expect(dialog).toHaveCount(0);

      // ── Checklist: welcome done, photo to do, the rest N/A for a new member. ──
      const card = p.locator('[data-tour="dashboard.checklist"]');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText("1 of 2 done");
      await expect(card.getByText("Nothing assigned to you yet")).toBeVisible();
      expect(await hasHorizontalScroll(p)).toBe(false);

      // ── Show me → Settings, tour starts on the photo step. ──
      await card.getByRole("button", { name: "Show me how: Add a profile photo" }).click();
      await p.waitForURL(/\/settings/);
      await expect(p.locator(".driver-popover-title")).toHaveText("Your photo", { timeout: 15_000 });
      await p.keyboard.press("Escape");
      await expect(p.locator(".driver-popover")).toHaveCount(0);

      // ── Dismiss sticks; the Help menu brings it back. ──
      await p.goto("/dashboard");
      await waitForApp(p);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByRole("button", { name: "Hide the Getting started checklist" }).click();
      await expect(card).toHaveCount(0);
      await expect.poll(async () => (await progress()).find((r) => r.tour_id === "checklist")?.status).toBe("dismissed");
      await p.reload();
      await waitForApp(p);
      await p.waitForTimeout(2000);
      await expect(card).toHaveCount(0);
      await p.getByRole("button", { name: /^Help and tours/ }).click();
      await p.getByRole("menuitem", { name: "Getting started checklist" }).click();
      await expect(card).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("checklist rules (pure)", () => {
  const base = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
    role: "member",
    canCreateProject: false,
    canExportProposals: false,
    canManageTeam: false,
    accessible: new Set(["/dashboard", "/projects", "/workload", "/gantt", "/team", "/proposals", "/settings"]),
    progress: {},
    hasAvatar: false,
    hasWeeklyHours: false,
    assignments: { accepted: 0, pending: 0 },
    loggedAny: false,
    firstAcceptedTaskHref: null,
    ownsProject: false,
    ownsEstimate: false,
    teamSize: 1,
    zohoConnected: false,
    zohoAvailable: true,
    ...over,
  });
  const state = (i: ChecklistInput, id: string) => checklistItems(i).find((x) => x.id === id)?.state;
  const ids = (i: ChecklistInput) => checklistItems(i).map((x) => x.id);

  test("each item ticks from data, both ways", () => {
    const at = new Date().toISOString();
    expect(state(base(), "welcome")).toBe("todo");
    expect(state(base({ progress: { welcome: { version: 1, status: "completed", at } } }), "welcome")).toBe("done");
    // Dismissing the welcome tour is not taking it.
    expect(state(base({ progress: { welcome: { version: 1, status: "dismissed", at } } }), "welcome")).toBe("todo");
    expect(state(base(), "photo")).toBe("todo");
    expect(state(base({ hasAvatar: true }), "photo")).toBe("done");

    expect(state(base(), "respond")).toBe("na");
    expect(state(base({ assignments: { accepted: 0, pending: 2 } }), "respond")).toBe("todo");
    expect(state(base({ assignments: { accepted: 1, pending: 2 } }), "respond")).toBe("done");

    expect(state(base(), "log-hours")).toBe("na");
    expect(state(base({ assignments: { accepted: 1, pending: 0 } }), "log-hours")).toBe("todo");
    expect(state(base({ assignments: { accepted: 1, pending: 0 }, loggedAny: true }), "log-hours")).toBe("done");

    const mgr = { role: "manager" as const, canCreateProject: true, canExportProposals: true };
    expect(state(base(mgr), "weekly-hours")).toBe("todo");
    expect(state(base({ ...mgr, hasWeeklyHours: true }), "weekly-hours")).toBe("done");
    expect(state(base(mgr), "project")).toBe("todo");
    expect(state(base({ ...mgr, ownsProject: true }), "project")).toBe("done");
    expect(state(base(mgr), "estimate")).toBe("todo");
    expect(state(base({ ...mgr, ownsEstimate: true }), "estimate")).toBe("done");

    const admin = { role: "admin" as const, canCreateProject: true, canExportProposals: true, canManageTeam: true };
    expect(state(base(admin), "invite")).toBe("todo");
    expect(state(base({ ...admin, teamSize: 4 }), "invite")).toBe("done");
    expect(state(base(admin), "zoho")).toBe("todo");
    expect(state(base({ ...admin, zohoConnected: true }), "zoho")).toBe("done");

    expect(state(base({ role: "viewer" }), "timeline")).toBe("todo");
    expect(state(base({ role: "viewer", progress: { gantt: { version: 1, status: "completed", at } } }), "timeline")).toBe("done");
  });

  test("items follow role and page access", () => {
    expect(ids(base())).toEqual(["welcome", "photo", "respond", "log-hours"]);
    expect(ids(base({ role: "viewer" }))).toEqual(["welcome", "photo", "timeline"]);
    expect(ids(base({ role: "manager", canCreateProject: true, canExportProposals: true }))).toEqual([
      "welcome",
      "photo",
      "weekly-hours",
      "project",
      "estimate",
    ]);
    expect(
      ids(base({ role: "admin", canCreateProject: true, canExportProposals: true, canManageTeam: true })),
    ).toEqual(["welcome", "photo", "weekly-hours", "project", "estimate", "invite", "zoho"]);
    // Demo mode has no Zoho to connect.
    expect(ids(base({ role: "admin", canManageTeam: true, zohoAvailable: false }))).not.toContain("zoho");
    // No page access, no item that sends you there.
    expect(ids(base({ role: "viewer", accessible: new Set(["/dashboard", "/settings"]) }))).toEqual([
      "welcome",
      "photo",
    ]);
  });

  test("N/A never blocks 100%, unknown holds it back", () => {
    const at = new Date().toISOString();
    const done = base({ hasAvatar: true, progress: { welcome: { version: 1, status: "completed", at } } });
    expect(checklistProgress(checklistItems(done))).toEqual({ done: 2, total: 2, ready: true, complete: true });
    const loading = base({ assignments: null });
    expect(checklistProgress(checklistItems(loading)).ready).toBe(false);
    expect(checklistProgress(checklistItems(loading)).complete).toBe(false);
  });
});
