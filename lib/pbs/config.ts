import "server-only";

/**
 * PBS (billing system) API config, driven entirely by server-only env vars.
 *
 * Credentials come from a one-off `POST /api/register` against PBS, done by
 * hand — this app never registers itself (see lib/pbs/endpoints.ts).
 *
 * The base path is `/api`, NOT the `/pbs/api` the reference doc states.
 * Verified 2026-08-26: `/pbs/api/*` is caught by the PBS session layer and
 * answers **HTTP 200 with an HTML login redirect**, which any `res.ok` check
 * would sail straight past. It's an env var so a server-side change is config,
 * not a redeploy.
 */
const DEFAULT_BASE = "https://pbsserver.com/api";

export const pbsConfig = {
  baseUrl: (process.env.PBS_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, ""),
  appId: process.env.PBS_APP_ID ?? "",
  appSecret: process.env.PBS_APP_SECRET ?? "",
  /** One fixed template for estimator-created POs (Phase 3). */
  projectTemplateId: process.env.PBS_PROJECT_TEMPLATE_ID ?? "",
  /**
   * Billing client an estimate uses unless one is chosen for it. A three-letter
   * client CODE rather than a numeric id: codes are what people read on POs, and
   * an id is meaningless without looking it up.
   */
  defaultClient: (process.env.PBS_DEFAULT_CLIENT ?? "STR").trim(),
};

export const isPbsConfigured = Boolean(pbsConfig.appId && pbsConfig.appSecret);
