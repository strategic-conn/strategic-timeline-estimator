/**
 * Session-refresh helper called from the root middleware on every request.
 *
 * IMPORTANT: until Supabase env vars are set this is a pass-through no-op, so the
 * current demo (Zustand + localStorage) keeps working unchanged. Once configured,
 * it refreshes the auth cookie and is the right place to add route guards.
 *
 * See docs/backend-supabase.md → "Auth flow".
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet → don't touch the request (keeps the demo working).
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touch the session so Supabase can rotate the cookie if needed.
  // (Add role-based redirects here once auth is live.)
  await supabase.auth.getUser();

  return response;
}
