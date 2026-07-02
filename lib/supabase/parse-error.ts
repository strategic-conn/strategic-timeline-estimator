/**
 * Maps Supabase Auth / Postgres / RLS errors to friendly, user-facing messages.
 * Use in `onError` / catch blocks before surfacing a toast or form error.
 */
export function parseSupabaseError(
  error: { message?: string } | null | undefined,
): string {
  if (!error?.message) return "Something went wrong. Please try again.";
  const m = error.message.toLowerCase();

  if (m.includes("invalid login credentials"))
    return "Incorrect email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email before signing in.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "An account with this email already exists.";
  // Invite-only: the handle_new_user trigger rejects un-invited emails. GoTrue
  // masks trigger exceptions as "Database error saving new user".
  if (m.includes("invite list") || m.includes("database error saving new user"))
    return "This email isn’t on the invite list. Ask an admin to invite you first.";
  if (m.includes("password should be at least") || m.includes("password is too short"))
    return "Password must be at least 6 characters.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a moment and try again.";
  if (m.includes("row-level security") || m.includes("violates row-level"))
    return "You don't have permission to do that.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Network error — check your connection and try again.";

  return error.message;
}
