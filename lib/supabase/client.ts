/**
 * Supabase browser client — for use in Client Components.
 *
 * Reads the public anon key (safe to expose; Row-Level Security is what protects
 * data — see docs/backend-supabase.md). Returns a fresh client per call so it can
 * be created inside components/hooks without sharing mutable state across renders.
 *
 * This is the live browser client used by every synced store (projects, tasks,
 * comments, notifications, realtime, avatar upload, …) when `isSupabaseConfigured`.
 * With no env vars the stores skip it and fall back to the Zustand/localStorage demo.
 */
import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
