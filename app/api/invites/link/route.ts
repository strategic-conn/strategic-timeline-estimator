import { NextResponse } from "next/server";

import { createSetupLink, findUserByEmail, hasSetPassword } from "@/lib/auth/setup-link";
import { requireAdmin, serverError } from "@/lib/supabase/require-admin";

/**
 * POST /api/invites/link { email } — admin-only. A password-setup link for
 * someone who was invited but can't get in (their emailed link was used up by
 * an email scanner, expired, or never arrived). See lib/auth/setup-link.ts.
 *
 * Refused for anyone who has already chosen a password: the link signs its
 * holder in as that person, and an admin must not be able to do that to a
 * colleague who is set up. They can use "Forgot password" instead.
 */
export async function POST(request: Request) {
  try {
    const gate = await requireAdmin();
    if ("error" in gate) return gate.error;
    const { admin } = gate.ctx;

    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const user = await findUserByEmail(admin, email);
    if (!user) {
      return NextResponse.json(
        { error: "There is no account for that email yet. Send an invite first." },
        { status: 404 },
      );
    }
    if (hasSetPassword(user)) {
      return NextResponse.json(
        {
          error:
            "They have already set a password. If they forgot it, they can use “Forgot password” on the sign-in page.",
        },
        { status: 409 },
      );
    }

    const link = await createSetupLink(admin, email, new URL(request.url).origin);
    if ("error" in link) return serverError("/api/invites/link", link.error, 400);
    return NextResponse.json({ url: link.url });
  } catch (e) {
    return serverError("/api/invites/link", e);
  }
}
