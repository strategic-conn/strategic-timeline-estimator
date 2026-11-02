"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Does the signed-in person have a verified authenticator app? `null` until
 * read (and always in demo mode, which has no auth server). Feeds the
 * Getting started item and the periodic set-up reminder.
 */
export function useHasTwoFactor(): boolean | null {
  const [has, setHas] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let on = true;
    void createClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (on && !error) setHas(data.totp.some((f) => f.status === "verified"));
      });
    return () => {
      on = false;
    };
  }, []);
  return has;
}
