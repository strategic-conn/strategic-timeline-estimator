import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/require-admin";
import { zohoConfig } from "@/lib/zoho/config";
import { saveConnection } from "@/lib/zoho/tokens";

/**
 * Step 2 of OAuth: Zoho redirects here with `?code&state`. We verify the CSRF
 * state, exchange the code for tokens (server-side, with the client secret),
 * and store the refresh token. Data-center aware: Zoho's `accounts-server`
 * query param says which server to use for the token swap.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (status: string) =>
    NextResponse.redirect(`${origin}/settings?zoho=${status}`);

  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  if (url.searchParams.get("error")) {
    console.error("[zoho callback] consent error", url.searchParams.get("error"));
    return back("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("zoho_oauth_state")?.value;

  // Opened directly (no OAuth params) — the usual cause of a "failed" callback.
  // Not an error: this URL is only ever reached via Zoho's redirect.
  if (!code && !state) return back("notstarted");
  // Zoho sent us back, but our CSRF cookie is gone (expired >10min, or blocked).
  if (!expected) return back("statemissing");
  if (!code || !state || state !== expected) return back("badstate");

  const accountsServer =
    url.searchParams.get("accounts-server") || zohoConfig.accountsDomain;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: zohoConfig.clientId,
    client_secret: zohoConfig.clientSecret,
    redirect_uri: zohoConfig.redirectUri,
    code,
  });
  const tokenRes = await fetch(`${accountsServer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await tokenRes.json().catch(() => null);

  // NOTE: never log `data` itself — on the success path it carries live tokens,
  // and server logs are a lower-trust store. Log the error code / shape only.
  if (!tokenRes.ok || !data?.access_token) {
    console.error(
      "[zoho callback] token exchange failed",
      tokenRes.status,
      data?.error ?? "(no error field)",
    );
    return back("exchangefailed");
  }
  if (!data.refresh_token) {
    // Zoho only returns a refresh_token on first consent. Since we always send
    // prompt=consent this shouldn't happen — surface it rather than store a
    // connection that can't be refreshed.
    console.error(
      "[zoho callback] no refresh_token returned; response fields:",
      Object.keys(data).join(","),
    );
    return back("norefresh");
  }

  const expiresAt = new Date(
    Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
  ).toISOString();

  const { error } = await saveConnection({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    api_domain: data.api_domain ?? "https://www.zohoapis.com",
    accounts_server: accountsServer,
    expires_at: expiresAt,
    connected_by: gate.ctx.user.id,
  });
  if (error) {
    console.error("[zoho callback] save failed", error);
    return back("savefailed");
  }

  const res = back("connected");
  res.cookies.delete("zoho_oauth_state");
  return res;
}
