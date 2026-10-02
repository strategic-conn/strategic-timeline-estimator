import { NextResponse } from "next/server";

import { requireAdmin, serverError } from "@/lib/supabase/require-admin";
import {
  createSetupLink,
  findUserByEmail,
  hasSetPassword,
} from "@/lib/auth/setup-link";

const VALID_ROLES = ["admin", "manager", "member", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * POST /api/invites — admin-only. Records the email on the allowlist (so the
 * signup trigger accepts it) and sends a Supabase invite email. The invitee
 * clicks the link → /auth/confirm establishes a session → /accept-invite lets
 * them set a password. The response also carries a `setupLink` (see
 * lib/auth/setup-link.ts) for when the email's own link gets used up.
 */
export async function POST(request: Request) {
  try {
    return await handleInvite(request);
  } catch (e) {
    return serverError("/api/invites", e);
  }
}

async function handleInvite(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { supabase, admin, user } = gate.ctx;

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

  // Record the allowlist entry first so the handle_new_user trigger accepts the
  // signup created by the invite. Upsert keeps the chosen role current.
  const { error: allowErr } = await supabase
    .from("allowed_emails")
    .upsert(
      { email, role, invited_by: user.id, page_access: pageAccess },
      { onConflict: "email" },
    );
  if (allowErr) {
    return serverError("/api/invites allowlist", allowErr, 400);
  }

  // Send the invite email. `redirectTo` is where Supabase sends them after its
  // own verify step (when the template still uses {{ .ConfirmationURL }}); it
  // must be in the project's Redirect URLs or Supabase falls back to the Site
  // URL root, where InviteHashCatcher forwards them on anyway.
  const origin = new URL(request.url).origin;
  const invite = () =>
    admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { name } : undefined,
      redirectTo: `${origin}/accept-invite`,
    });

  let { error: inviteErr } = await invite();

  if (inviteErr && /already.*registered/i.test(inviteErr.message)) {
    const existing = await findUserByEmail(admin, email);
    if (!existing) return serverError("/api/invites lookup", inviteErr, 400);

    if (!existing.email_confirmed_at && !existing.last_sign_in_at) {
      // Never confirmed: the old link expired. Delete the stale row and send a
      // fresh invite. The allowlist row from the upsert above survives
      // deleteUser, so the signup trigger rebuilds the profile.
      await admin.auth.admin.deleteUser(existing.id);
      ({ error: inviteErr } = await invite());
    } else if (hasSetPassword(existing)) {
      return NextResponse.json(
        { error: "That email already has an active account." },
        { status: 400 },
      );
    } else {
      // Confirmed but never chose a password — an email scanner opened the
      // earlier link before they did. Never delete a confirmed account; hand
      // the admin a link that only works when a person presses Continue.
      const link = await createSetupLink(admin, email, origin);
      if ("error" in link) return serverError("/api/invites setup link", link.error, 400);
      return NextResponse.json({ ok: true, emailed: false, setupLink: link.url });
    }
  }

  if (inviteErr) {
    return serverError("/api/invites send", inviteErr, 400);
  }

  // A backup link the admin can pass on directly if the email is scanned,
  // filtered or slow. It is a separate token from the emailed invite, so
  // making it does not break the email.
  const link = await createSetupLink(admin, email, origin);
  return NextResponse.json({
    ok: true,
    emailed: true,
    setupLink: "url" in link ? link.url : null,
  });
}

