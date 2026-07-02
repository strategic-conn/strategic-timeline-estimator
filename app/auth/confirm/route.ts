import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — completes an email link (invite, signup, recovery) using
 * the token_hash flow, which is the SSR-friendly path (no PKCE code_verifier
 * cookie needed, since these links aren't browser-initiated). The Supabase email
 * template must point here, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
 * On success the session cookie is set and we redirect to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Invalid or expired link.
  return NextResponse.redirect(
    new URL("/login?error=invite_invalid", origin),
  );
}
