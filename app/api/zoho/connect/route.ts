import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/require-admin";
import { isZohoConfigured, zohoConfig } from "@/lib/zoho/config";

const SETTINGS = "/settings?zoho=";

/**
 * Step 1 of OAuth: admin-only. Sets a CSRF `state` cookie and redirects to
 * Zoho's consent screen. `access_type=offline` + `prompt=consent` guarantee a
 * refresh_token comes back so the connection is durable.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const origin = new URL(req.url).origin;
  if (!isZohoConfigured) {
    return NextResponse.redirect(`${origin}${SETTINGS}notconfigured`);
  }

  const state = crypto.randomUUID();
  const authUrl = new URL(`${zohoConfig.accountsDomain}/oauth/v2/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", zohoConfig.clientId);
  authUrl.searchParams.set("scope", zohoConfig.scopes);
  authUrl.searchParams.set("redirect_uri", zohoConfig.redirectUri);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("zoho_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
