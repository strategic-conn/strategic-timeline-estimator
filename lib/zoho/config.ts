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
// Read-only CRM by default. Widen via ZOHO_SCOPES (comma-separated) if you need
// to write back — e.g. add "ZohoCRM.modules.CREATE".
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
