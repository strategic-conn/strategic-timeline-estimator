import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Tests run against LIVE Supabase + Zoho, so they need the same env as the app.
loadEnv({ path: ".env.local" });

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * E2E suite — runs against the real stack.
 *
 * Safety rules baked in (agreed before writing these):
 *  - Anything a test creates is prefixed "[E2E]" and removed in teardown.
 *  - Tests never modify pre-existing projects/quotes/tasks.
 *  - The Zoho **push** is never automated: it writes to a CRM with ~900 real
 *    deals and permanently marks a quote as pushed. Zoho *reads* are covered.
 *  - Runs serially (workers: 1) so parallel runs can't fight over shared data.
 */
export default defineConfig({
  testDir: "./e2e",
  // Shared live data — parallelism would make tests interfere with each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    // Logs in once; every other project reuses the saved session.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: "e2e/.auth/user.json",
      },
    },
    {
      name: "tablet",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        // iPad portrait — the icon-rail breakpoint.
        viewport: { width: 768, height: 1024 },
        storageState: "e2e/.auth/user.json",
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        storageState: "e2e/.auth/user.json",
      },
    },
  ],

  // Reuse a dev server if one is already up; otherwise start one.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
