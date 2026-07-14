"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Catches Supabase's implicit-flow landing. Some email links (default invite
 * template, or when the token_hash flow isn't used) verify server-side and
 * redirect to the Site URL root with the session in the URL hash:
 *   https://app/#access_token=…&refresh_token=…&type=invite
 * The marketing page ignores that, stranding the invitee here. This establishes
 * the session from the hash and forwards them to finish onboarding.
 */
export function InviteHashCatcher() {
  const router = useRouter();

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const type = params.get("type");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    void supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) return;
        // invite/recovery → set a password; anything else → straight to the app.
        const dest =
          type === "invite" || type === "recovery"
            ? "/accept-invite"
            : "/dashboard";
        router.replace(dest);
      });
  }, [router]);

  return null;
}
