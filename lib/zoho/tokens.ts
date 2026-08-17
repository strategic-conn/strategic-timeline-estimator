import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { zohoConfig } from "@/lib/zoho/config";

/**
 * Server-only Zoho token store + API helper. Uses a service-role Supabase client
 * (untyped for `zoho_connection`, which isn't in the generated Database types
 * until migration 0028 is pushed + `npm run db:types` is run). The connection
 * row is a singleton (id=true).
 */

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

interface Connection {
  refresh_token: string;
  access_token: string | null;
  api_domain: string;
  accounts_server: string;
  expires_at: string | null;
}

async function getConnection(): Promise<Connection | null> {
  const { data } = await db()
    .from("zoho_connection")
    .select("refresh_token, access_token, api_domain, accounts_server, expires_at")
    .eq("id", true)
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

/** Non-secret metadata for the UI (never returns tokens). */
export async function getConnectionMeta(): Promise<
  { connected_at: string; api_domain: string } | null
> {
  const { data } = await db()
    .from("zoho_connection")
    .select("connected_at, api_domain")
    .eq("id", true)
    .maybeSingle();
  return (data as { connected_at: string; api_domain: string } | null) ?? null;
}

export async function saveConnection(row: {
  refresh_token: string;
  access_token: string;
  api_domain: string;
  accounts_server: string;
  expires_at: string;
  connected_by: string;
}) {
  const now = new Date().toISOString();
  return db()
    .from("zoho_connection")
    .upsert(
      { id: true, ...row, connected_at: now, updated_at: now },
      { onConflict: "id" },
    );
}

export async function deleteConnection() {
  return db().from("zoho_connection").delete().eq("id", true);
}

/** Exchange the stored refresh token for a fresh access token (cached on the row). */
async function refresh(conn: Connection): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: zohoConfig.clientId,
    client_secret: zohoConfig.clientSecret,
    refresh_token: conn.refresh_token,
  });
  const res = await fetch(`${conn.accounts_server}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    // Log the error code only — never the payload, which can carry tokens.
    console.error("[zoho] refresh failed", res.status, data?.error ?? "(no error field)");
    return null;
  }
  const expiresAt = new Date(
    Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
  ).toISOString();
  await db()
    .from("zoho_connection")
    .update({
      access_token: data.access_token,
      api_domain: data.api_domain ?? conn.api_domain,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  return data.access_token as string;
}

/** A valid access token — cached until ~1 min before expiry, else refreshed. */
export async function getAccessToken(): Promise<string | null> {
  const conn = await getConnection();
  if (!conn) return null;
  const stillValid =
    conn.access_token &&
    conn.expires_at &&
    new Date(conn.expires_at).getTime() > Date.now();
  return stillValid ? conn.access_token : refresh(conn);
}

/**
 * Call the Zoho CRM API against the connection's stored api_domain with a valid
 * bearer token. Returns the raw Response — callers parse + handle status.
 */
export async function zohoFetch(path: string, init?: RequestInit): Promise<Response> {
  const conn = await getConnection();
  if (!conn) throw new Error("Zoho is not connected.");
  const token = await getAccessToken();
  if (!token) throw new Error("Couldn't obtain a Zoho access token.");
  const base = conn.api_domain || "https://www.zohoapis.com";
  // File uploads must keep fetch's own multipart Content-Type (it carries the
  // boundary) — forcing application/json here would corrupt the request body.
  const isMultipart =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
}
