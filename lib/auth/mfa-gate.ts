/**
 * Two-factor sign-in (authenticator app, Supabase Auth MFA) — what a signed-in
 * session still owes. Pure, so the proxy and the e2e spec share one rule.
 *
 *  - "verify": they have a verified factor but this session only proved the
 *    password (aal1) → /mfa asks for the 6-digit code.
 *  - "enroll": two-factor is REQUIRED (MFA_REQUIRED=true) and they have no
 *    factor yet → /mfa walks them through setting one up.
 *  - "ok": nothing owed.
 *
 * The proxy is the UX gate; the database is the real one (0052's restrictive
 * `mfa_aal2` policy refuses an aal1 session of anyone with a verified factor).
 * MFA_REQUIRED is enforced by the proxy only — flip it on and every API route
 * and page is behind /mfa, but PostgREST still answers a factor-less aal1
 * token, exactly as it does today.
 */
export type MfaState = "ok" | "verify" | "enroll";

export function mfaState(input: {
  hasVerifiedFactor: boolean;
  aal: string | null | undefined;
  required: boolean;
}): MfaState {
  if (input.hasVerifiedFactor) return input.aal === "aal2" ? "ok" : "verify";
  return input.required ? "enroll" : "ok";
}

/** Server-only flag; read where it is used so a Vercel change needs no code. */
export function mfaRequired(): boolean {
  return process.env.MFA_REQUIRED === "true";
}

/** How long "Not now" (or ignoring it) silences the set-up reminder. */
export const TWO_FACTOR_REMIND_DAYS = 14;

/**
 * A `2fa-reminder` entry at this version means "never remind". Only the e2e bot
 * carries it (scripts/seed-e2e-user.mjs): it has no authenticator, and a toast
 * appearing mid-suite every 14 days would be a flake nobody could reproduce.
 */
export const TWO_FACTOR_REMIND_OFF_VERSION = 1000;

/**
 * Whether to show the "turn on two-factor" reminder now: only to someone
 * without a factor, at most once per TWO_FACTOR_REMIND_DAYS since it was last
 * shown. `null` hasFactor = not known yet → never (no flash before the read).
 */
export function shouldRemindTwoFactor(input: {
  hasFactor: boolean | null;
  last: { at: string; version: number } | null | undefined;
  now: number;
}): boolean {
  if (input.hasFactor !== false) return false;
  if (!input.last) return true;
  if (input.last.version >= TWO_FACTOR_REMIND_OFF_VERSION) return false;
  return input.now - Date.parse(input.last.at) >= TWO_FACTOR_REMIND_DAYS * 86_400_000;
}
