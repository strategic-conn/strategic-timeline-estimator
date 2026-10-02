import { NextResponse } from "next/server";

import { markPasswordSet } from "@/lib/auth/setup-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/password-set — the signed-in person has a password of their
 * own (they just chose one on /accept-invite, or signed in with one). Recorded
 * in app_metadata with the service key, so it can't be faked or cleared from
 * the browser. From then on an admin can no longer make a setup link for
 * them (lib/auth/setup-link.ts).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You're not signed in." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 501 });
  try {
    await markPasswordSet(admin, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/auth/password-set]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
