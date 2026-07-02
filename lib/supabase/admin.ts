import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Service-role Supabase client — **server-only**. Bypasses RLS, so it must never
 * be imported into a Client Component or exposed to the browser (`server-only`
 * throws at build time if that happens). Used for admin actions like sending
 * invite emails (`auth.admin.inviteUserByEmail`).
 *
 * Returns null when `SUPABASE_SERVICE_ROLE_KEY` isn't set, so callers can fail
 * gracefully with a clear message instead of crashing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
