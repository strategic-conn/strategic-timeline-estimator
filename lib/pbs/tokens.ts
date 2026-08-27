import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isPbsConfigured, pbsConfig } from "@/lib/pbs/config";
import {
  assertAllowedEndpoint,
  isSuccessEnvelope,
  type PbsEndpoint,
} from "@/lib/pbs/endpoints";

/**
 * PBS access tokens and the single call seam.
 *
 * Three things about this API shape the design, all verified against the live
 * server on 2026-08-26 rather than taken from the reference doc:
 *
 *  1. **`Authorization: Bearer` is rejected** ("Access token is required."), and
 *     `?access_token=` puts a credential in every access log and proxy. Every
 *     endpoint accepts POST with a JSON body, so that is what we use — reads
 *     included.
 *  2. **Minting is unconditional and non-revoking.** Tokens coexist, so two
 *     instances minting at once is harmless and no lock is needed. `/refresh`
 *     rotates with no reuse window, which would be a live concurrency hazard,
 *     so it is never called.
 *  3. **Failures can arrive as HTTP 200** — a wrong base path returns an HTML
 *     login redirect with a 200. Success is decided by the parsed envelope.
 */

/** Re-mint this far before expiry so an in-flight call can't age out. */
const RENEW_MARGIN_MS = 60_000;

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Cached = { access_token: string; expires_at: string; app_id: string };

async function readCached(): Promise<Cached | null> {
  const { data } = await db()
    .from("pbs_connection")
    .select("access_token, expires_at, app_id")
    .eq("id", true)
    .maybeSingle();
  return (data as Cached | null) ?? null;
}

/** Mint a fresh token and cache it. Safe to race — PBS tokens coexist. */
async function mint(): Promise<string> {
  const res = await fetch(`${pbsConfig.baseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: pbsConfig.appId,
      app_secret: pbsConfig.appSecret,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!isSuccessEnvelope(body) || !body?.data?.access_token) {
    throw new Error(
      `PBS refused to issue a token: ${
        body?.message ?? `HTTP ${res.status} (non-JSON body — check PBS_BASE_URL)`
      }`,
    );
  }
  const token = String(body.data.access_token);
  const expiresIn = Number(body.data.expires_in);
  const expiresAt = new Date(
    Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
  ).toISOString();

  const { error } = await db().from("pbs_connection").upsert({
    id: true,
    access_token: token,
    expires_at: expiresAt,
    app_id: pbsConfig.appId,
    updated_at: new Date().toISOString(),
  });
  // A failed cache write costs one extra mint next time, nothing more.
  if (error) console.error("[pbs] couldn't cache the access token", error);
  return token;
}

export async function getAccessToken(): Promise<string> {
  if (!isPbsConfigured) throw new Error("PBS is not configured.");
  const cached = await readCached();
  const fresh =
    cached &&
    // A credential change must invalidate the cache rather than reuse a token
    // minted for a different application.
    cached.app_id === pbsConfig.appId &&
    new Date(cached.expires_at).getTime() - RENEW_MARGIN_MS > Date.now();
  return fresh ? cached!.access_token : mint();
}

export type PbsResponse<T = unknown> = {
  ok: boolean;
  status: number;
  /** Parsed envelope; null when PBS answered with something that isn't JSON. */
  body: { status?: string; message?: string; data?: T } | null;
  /** PBS's own message, or a description of a non-JSON reply. */
  error: string | null;
};

/**
 * Call a PBS endpoint. Always POST with the credentials in the JSON body.
 *
 * `ok` means PBS said `status: "success"` — not that the HTTP status was 2xx,
 * which it also is for the HTML login redirect served at the wrong base path.
 */
export async function pbsFetch<T = unknown>(
  endpoint: PbsEndpoint,
  params: Record<string, unknown> = {},
): Promise<PbsResponse<T>> {
  assertAllowedEndpoint(endpoint);
  const token = await getAccessToken();

  const res = await fetch(`${pbsConfig.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      app_id: pbsConfig.appId,
      access_token: token,
    }),
  });

  const text = await res.text();
  let body: PbsResponse<T>["body"] = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!body) {
    return {
      ok: false,
      status: res.status,
      body: null,
      error: `PBS returned a non-JSON response (HTTP ${res.status}). Check PBS_BASE_URL — /pbs/api answers with an HTML login page.`,
    };
  }
  const ok = isSuccessEnvelope(body);
  return {
    ok,
    status: res.status,
    body,
    error: ok ? null : (body.message ?? `PBS request failed (HTTP ${res.status}).`),
  };
}
