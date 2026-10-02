/**
 * Session-refresh helper called from the root proxy.ts on every request.
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

  /**
   * Redirect WITHOUT losing the cookies Supabase just set.
   *
   * `setAll` writes onto `response`; a bare `NextResponse.redirect()` is a new
   * response that doesn't have them. Dropping them logs people out two ways:
   *
   *  - After a refresh, the rotated token never reaches the browser, which keeps
   *    a refresh token Supabase has already consumed. The next request can't
   *    refresh, and the session is gone.
   *  - When a session is invalid, the cookie-clearing headers are lost too, so
   *    the dead cookie stays put and every later visit bounces to /login again.
   */
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  // Touch the session so Supabase can rotate the cookie if needed. A transient
  // failure here (Supabase unreachable, a mangled cookie) must not take down
  // every route: treat it as "not signed in" and let the guards below decide.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch (e) {
    console.error("[auth] getUser failed in proxy", e);
  }

  // ── Route guards ──────────────────────────────────────────────────────────
  const path = request.nextUrl.pathname;
  const isAuthRoute = path === "/login" || path === "/register";
  // `/auth/*` (invite / email confirm handlers) must run before the guard, and
  // `/accept-invite` is reached from the confirm redirect to set a password.
  // `/forgot-password` is for people who CAN'T sign in — it bounced them to
  // /login, so the "forgot password" route out of a stuck invite never worked.
  const isPublic =
    isAuthRoute ||
    path === "/" ||
    path.startsWith("/auth/") ||
    path === "/accept-invite" ||
    path === "/forgot-password";

  // Unauthenticated → bounce protected routes to the login screen. API routes
  // get a 401 instead: a 307 to an HTML login page makes every fetch fail on
  // `res.json()` with a parse error, hiding the real reason from the caller.
  if (!signedIn && !isPublic) {
    if (path.startsWith("/api/")) {
      const denied = NextResponse.json(
        { error: "Your session has expired — sign in again." },
        { status: 401 },
      );
      for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
      return denied;
    }
    return redirectTo("/login");
  }

  // Already signed in → keep them out of the auth screens.
  if (signedIn && isAuthRoute) return redirectTo("/dashboard");

  return response;
}
