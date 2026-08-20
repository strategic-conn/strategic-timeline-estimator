import { test, expect } from "@playwright/test";
import {
  collectConsoleErrors,
  hasHorizontalScroll,
  waitForApp,
} from "./helpers";

/**
 * Read-only smoke pass: every route renders, logs no console errors, and does
 * not scroll sideways. Runs at all three viewports, so it doubles as the
 * regression guard for the responsive work.
 *
 * Creates nothing — safe to run against live at any time.
 */
/**
 * Expected headings are the real `<h1>` text, which is not always the nav label:
 *  - /dashboard greets the user ("Welcome back, <name>")
 *  - /workload is role-dependent — "Resource allocation" for manager/admin,
 *    "My workload" for a member. The E2E account is a manager.
 */
const ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /welcome back/i },
  { path: "/projects", heading: /projects/i },
  { path: "/activity", heading: /activity/i },
  { path: "/reports", heading: /reports/i },
  { path: "/calendar", heading: /calendar/i },
  { path: "/gantt", heading: /timeline/i },
  { path: "/workload", heading: /resource allocation|my workload/i },
  { path: "/team", heading: /team/i },
  { path: "/proposals", heading: /estimator/i },
  { path: "/settings", heading: /settings/i },
];

for (const route of ROUTES) {
  test(`${route.path} renders cleanly`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const res = await page.goto(route.path);
    expect(res?.status(), `${route.path} should not be a server error`).toBeLessThan(400);

    await waitForApp(page);
    await expect(
      page.getByRole("heading", { name: route.heading }).first(),
      `${route.path} should show its heading`,
    ).toBeVisible();

    expect(
      await hasHorizontalScroll(page),
      `${route.path} must not scroll sideways`,
    ).toBe(false);

    expect(errors, `${route.path} logged console errors`).toEqual([]);
  });
}
