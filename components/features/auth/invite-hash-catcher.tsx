"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * What Supabase put in the URL hash after its own verify step, if anything.
 *
 * The default email templates link to Supabase's `/auth/v1/verify`, which then
 * redirects with either a session or an error in the hash:
 *   #access_token=…&refresh_token=…&type=invite
 *   #error=access_denied&error_code=otp_expired&error_description=…
 * The second one is what an invitee gets when an email scanner (Microsoft
 * SafeLinks) opened the link first and used up its one-time token.
 */
export type AuthHash =
  | { kind: "session"; access_token: string; refresh_token: string; type: string | null }
  | { kind: "error"; code: string | null; description: string | null }
  | null;

export function readAuthHash(): AuthHash {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (access_token && refresh_token) {
    return { kind: "session", access_token, refresh_token, type: p.get("type") };
  }
  if (p.get("error") || p.get("error_code")) {
    return { kind: "error", code: p.get("error_code"), description: p.get("error_description") };
  }
  return null;
}

/** Drop the hash so a reload doesn't replay it (tokens must not linger). */
export function clearAuthHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Mounted on the home page, where Supabase lands people when an email link's
 * `redirectTo` isn't in the project's allow-list. A session in the hash is
 * established and the person is sent on (invite/recovery → set a password);
 * an error in the hash goes to sign-in, which explains what happened and how
 * to get a working link — instead of leaving them on the marketing page.
 */
export function InviteHashCatcher() {
  const router = useRouter();

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    const found = readAuthHash();
    if (!found) return;

    if (found.kind === "error") {
      clearAuthHash();
      router.replace("/login?error=link_expired");
      return;
    }

    const supabase = createClient();
    void supabase.auth
      .setSession({ access_token: found.access_token, refresh_token: found.refresh_token })
      .then(({ error }) => {
        clearAuthHash();
        if (error) {
          router.replace("/login?error=link_expired");
          return;
        }
        // invite/recovery → set a password; anything else → straight to the app.
        const dest =
          found.type === "invite" || found.type === "recovery" ? "/accept-invite" : "/dashboard";
        router.replace(dest);
      });
  }, [router]);

  return null;
}
