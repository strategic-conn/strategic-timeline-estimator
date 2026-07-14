import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["admin", "manager", "member", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * POST /api/invites — admin-only. Records the email on the allowlist (so the
 * signup trigger accepts it) and sends a Supabase invite email. The invitee
 * clicks the link → /auth/confirm establishes a session → /accept-invite lets
 * them set a password.
 */
export async function POST(request: Request) {
  try {
    return await handleInvite(request);
  } catch (e) {
    // A raw thrown error serializes to `{}` over JSON — log it and return the
    // real message so the client shows something actionable.
    console.error("[/api/invites] unhandled error:", e);
    const message = e instanceof Error ? e.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleInvite(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You're not signed in." }, { status: 401 });
  }

  // Authorize: only admins may invite (mirrors the allowed_emails RLS).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    role?: unknown;
    name?: unknown;
    page_access?: unknown;
  } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = body?.role as Role;
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : undefined;
  // Optional custom page allowlist. Array of hrefs = custom; null/absent = role default.
  const pageAccess =
    Array.isArray(body?.page_access) &&
    body.page_access.every((h) => typeof h === "string")
      ? (body.page_access as string[])
      : null;

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Pick a valid role." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Email invites aren't configured on the server (missing SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 501 },
    );
  }

  // Record the allowlist entry first so the handle_new_user trigger accepts the
  // signup created by the invite. Upsert keeps the chosen role current.
  const { error: allowErr } = await supabase
    .from("allowed_emails")
    .upsert(
      { email, role, invited_by: user.id, page_access: pageAccess },
      { onConflict: "email" },
    );
  if (allowErr) {
    return NextResponse.json({ error: allowErr.message }, { status: 400 });
  }

  // Send the invite email. The email template links to /auth/confirm (see setup
  // notes); user_metadata.name flows into the profile via the signup trigger.
  const invite = () =>
    admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { name } : undefined,
    });

  let { error: inviteErr } = await invite();

  // Self-heal a stuck invite: inviteUserByEmail creates the auth user up front,
  // so if a first invite's link expired or was consumed (e.g. Outlook/Defender
  // SafeLinks pre-fetches and burns the one-time token), re-inviting fails with
  // "already registered". If that user never confirmed, delete the stale row and
  // re-send a fresh link. A user who actually set a password is left untouched.
  if (inviteErr && /already.*registered/i.test(inviteErr.message)) {
    const stale = await findPendingUser(admin, email);
    if (!stale) {
      return NextResponse.json(
        { error: "That email already has an active account." },
        { status: 400 },
      );
    }
    // The allowlist row is already in place from the upsert above (deleteUser
    // cascades the profile but not the allowlist), so the retry's signup trigger
    // will find it and rebuild the profile.
    await admin.auth.admin.deleteUser(stale.id);
    ({ error: inviteErr } = await invite());
  }

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Find an auth user by email that has NOT completed onboarding (never confirmed,
 * never signed in) — i.e. a stuck invite that's safe to delete and re-send.
 * Returns null if no match or the user already set a password.
 * ponytail: listUsers is paginated; one page of 1000 covers an internal team.
 * Swap for a filtered lookup if the directory ever outgrows a page.
 */
async function findPendingUser(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = data?.users.find((u) => u.email?.toLowerCase() === email);
  if (!match) return null;
  const confirmed = match.email_confirmed_at || match.last_sign_in_at;
  return confirmed ? null : match;
}
