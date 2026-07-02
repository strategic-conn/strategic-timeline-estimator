"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuthStore, type UserRole } from "@/store/auth-store";

/**
 * Syncs the live Supabase session/profile into the demo auth store (Phase 1
 * "bridge"). All existing consumers keep reading `useAuthStore`; here we just
 * keep that mirror in step with the real signed-in user.
 *
 * No-ops entirely when Supabase isn't configured, so the demo runs unchanged.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const applyProfile = useAuthStore((s) => s.applyProfile);
  const resetToDemo = useAuthStore((s) => s.resetToDemo);

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;

    const loadProfile = async (
      userId: string,
      fallbackEmail?: string,
      fallbackName?: string,
    ) => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, email, role, avatar_url, page_access")
        .eq("id", userId)
        .single();
      if (!active) return;

      if (data) {
        applyProfile({
          id: data.id,
          name: data.name,
          email: data.email,
          role: data.role as UserRole,
          avatar_url: data.avatar_url,
          page_access: data.page_access,
        });
      } else {
        // Trigger hasn't materialized the row yet — show something sensible.
        applyProfile({
          id: userId,
          name: fallbackName || fallbackEmail?.split("@")[0] || "User",
          email: fallbackEmail ?? "",
          role: "member",
        });
      }
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        void loadProfile(
          user.id,
          user.email ?? undefined,
          (user.user_metadata?.name as string | undefined) ?? undefined,
        );
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        resetToDemo();
        return;
      }
      if (session?.user) {
        void loadProfile(
          session.user.id,
          session.user.email ?? undefined,
          (session.user.user_metadata?.name as string | undefined) ?? undefined,
        );
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applyProfile, resetToDemo]);

  return <>{children}</>;
}
