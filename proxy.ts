import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every matched request (Next.js 16 "proxy" convention, formerly
 * "middleware"). Refreshes the Supabase auth session cookie and enforces route
 * guards. No-ops cleanly until Supabase env vars are configured
 * (see lib/supabase/middleware.ts), so it's safe while the app runs on demo data.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon and common static image types
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
