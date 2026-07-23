/**
 * Supabase server client — for Server Components, Route Handlers, and Server Actions.
 *
 * Binds Supabase auth to Next.js cookies via @supabase/ssr so the session lives in
 * httpOnly cookies (no token in localStorage). RLS uses `auth.uid()` from this
 * session to scope every query automatically.
 *
 * Used by lib/supabase/require-admin.ts to authenticate the caller (and check
 * their role) in the admin API routes: /api/invites, /api/users/[id],
 * /api/users/[id]/status. See docs/backend-supabase.md.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component (read-only cookies).
            // Safe to ignore when middleware refreshes the session on each request.
          }
        },
      },
    },
  );
}
