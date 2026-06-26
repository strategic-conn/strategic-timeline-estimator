/**
 * Supabase browser client — for use in Client Components.
 *
 * Reads the public anon key (safe to expose; Row-Level Security is what protects
 * data — see docs/backend-supabase.md). Returns a fresh client per call so it can
 * be created inside components/hooks without sharing mutable state across renders.
 *
 * NOTE: the app still runs on Zustand + localStorage today. This helper is the
 * seam for wiring real data later — it is not imported by any feature yet.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
