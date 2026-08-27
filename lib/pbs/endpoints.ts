/**
 * Every PBS endpoint this app is allowed to call, and whether it writes.
 *
 * Deny by default. `pbsFetch` refuses anything not listed here before the
 * request leaves the process — the same guard as `lib/zoho/write-allowlist.ts`,
 * for the same reason: the credentials are broad, so the real limit on what
 * this app can do lives in code that shows up in review.
 *
 * Two documented endpoints are deliberately absent:
 *
 *  - `register` — creates a new application on the PBS server, permanently.
 *    We register once, by hand, never from the app.
 *  - `refresh` — rotates the refresh token and kills the old one immediately,
 *    with no reuse window, which makes concurrent refreshes a live hazard.
 *    Minting is unconditional and non-revoking (verified 2026-08-26), so we
 *    re-mint instead and never touch this.
 *
 * `token` isn't listed either: minting is what `getAccessToken` does, and it
 * must not be reachable through the generic call path.
 */
export type PbsEndpoint =
  | "fetch"
  | "fetch-po"
  | "po"
  | "fetch-all-po"
  | "po-list"
  | "create-po";

/** Endpoints that change something in PBS. Everything else is read-only. */
export const PBS_WRITE_ENDPOINTS = ["create-po"] as const;

const ALLOWED: readonly PbsEndpoint[] = [
  "fetch",
  "fetch-po",
  "po",
  "fetch-all-po",
  "po-list",
  "create-po",
];

export function isAllowedEndpoint(name: string): name is PbsEndpoint {
  return (ALLOWED as readonly string[]).includes(name);
}

export function isWriteEndpoint(name: string): boolean {
  return (PBS_WRITE_ENDPOINTS as readonly string[]).includes(name);
}

/** Throws unless the endpoint is one this app is meant to call. */
export function assertAllowedEndpoint(name: string): void {
  if (isAllowedEndpoint(name)) return;
  throw new Error(
    `Blocked: this app may not call PBS "${name}". Allowed: ${ALLOWED.join(", ")}.`,
  );
}

/**
 * PBS answers some failures with HTTP 200 — most dangerously, the wrong base
 * path returns 200 with an HTML login redirect, and `fetch-po` without a key
 * returns 200 with EVERY PO instead of an error. So success is decided by the
 * parsed envelope, never by the status code.
 */
export function isSuccessEnvelope(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      (body as { status?: unknown }).status === "success",
  );
}
