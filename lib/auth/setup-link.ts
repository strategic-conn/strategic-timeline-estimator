import "server-only";

import type { User } from "@supabase/supabase-js";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Password-setup links that an email scanner cannot use up.
 *
 * ⚠️ Why this exists. Supabase's default invite email links straight to its
 * own `/auth/v1/verify`, which spends the one-time token on a plain GET.
 * Microsoft Defender / SafeLinks opens every link in a work inbox before the
 * person does — so the scanner accepted the invite (the account turned
 * "confirmed", even recorded a sign-in), and the human's click then landed on
 * the home page with `#error_code=otp_expired`, no session and no password.
 * The account looked active, so re-inviting refused ("already has an active
 * account"). Nobody could get in.
 *
 * The link built here points at OUR `/auth/confirm` page, which only spends
 * the token when a person presses Continue; a scanner's GET just renders the
 * page. It is a `recovery` token, verified live (2026-10-03) to work for both
 * a pending invitee (and it confirms them) and a scanner-confirmed account,
 * and to lead into /accept-invite to set a password. Generating a new one
 * invalidates the previous recovery link — not the emailed invite.
 */
export async function createSetupLink(
  admin: Admin,
  email: string,
  origin: string,
): Promise<{ url: string } | { error: string }> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const token = data?.properties?.hashed_token;
  if (error || !token) return { error: error?.message ?? "No token returned." };
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", token);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/accept-invite");
  return { url: url.toString() };
}

/**
 * Has this person chosen their own password? Recorded in `app_metadata`
 * (writable only with the service key — `user_metadata` is the user's own and
 * could be cleared by them) when /accept-invite saves a password or someone
 * signs in with one.
 *
 * An admin may only make a setup link for an account that has NOT, so the
 * link can't be used to sign in as a colleague who is already set up.
 */
export function hasSetPassword(user: Pick<User, "app_metadata">): boolean {
  return user.app_metadata?.password_set === true;
}

export async function markPasswordSet(admin: Admin, user: User): Promise<void> {
  if (hasSetPassword(user)) return;
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, password_set: true },
  });
}

/** Look an auth user up by email (one page of 1000 covers an internal team). */
export async function findUserByEmail(admin: Admin, email: string): Promise<User | null> {
  // ponytail: one page of 1000; swap for a filtered lookup if the team outgrows it.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === email) ?? null;
}
