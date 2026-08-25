import "server-only";

/**
 * Zoho OAuth config, driven entirely by server-only env vars. The client
 * ID/secret come from the Zoho API Console (https://api-console.zoho.com) —
 * register a "Server-based Application" whose Authorized Redirect URI EXACTLY
 * matches `ZOHO_REDIRECT_URI`.
 *
 * Data centers: the authorize step uses `accountsDomain` (default .com); the
 * callback then tells us the real accounts server + api domain, which we store
 * and reuse — so this works for any DC (.com/.eu/.in/.com.au/.jp/.ca).
 */
const DEFAULT_ACCOUNTS = "https://accounts.zoho.com";
// Read-only CRM by default — a fresh install can't write to anyone's CRM by
// accident. Widen via ZOHO_SCOPES (comma-separated); .env.example carries the
// full set this project asks for in production.
//
// Scopes freeze at consent, so the deployed value is whatever was on the screen
// the day someone clicked Accept — changing this only affects the NEXT consent.
// That's why the production set is deliberately broad (create/update across the
// CRM, notifications, coql, bulk): one approval, no re-consent every time a
// feature ships. What the app may actually change is enforced in code by
// lib/zoho/write-allowlist.ts, NOT by the scope string.
//
// Never requested, at any tier: any .DELETE, and .ALL on records or settings.
// A deleted CRM record has no undo, and settings.ALL would let this app rewrite
// layouts and picklists it only needs to read.
const DEFAULT_SCOPES = [
  "ZohoCRM.modules.READ",
  "ZohoCRM.users.READ",
  "ZohoCRM.org.READ",
  "ZohoCRM.settings.READ",
].join(",");

export const zohoConfig = {
  clientId: process.env.ZOHO_CLIENT_ID ?? "",
  clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
  redirectUri:
    process.env.ZOHO_REDIRECT_URI ??
    "https://timeline-estimator-project-manageme.vercel.app/api/zoho/callback",
  scopes: process.env.ZOHO_SCOPES ?? DEFAULT_SCOPES,
  accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN ?? DEFAULT_ACCOUNTS,
};

export const isZohoConfigured = Boolean(
  zohoConfig.clientId && zohoConfig.clientSecret,
);
