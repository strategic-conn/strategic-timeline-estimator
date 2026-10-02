"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";

type AuthResult = { error: string | null };
type SignUpResult = AuthResult & { needsConfirmation: boolean };

/**
 * Real Supabase Auth actions for Client Components (Phase 1).
 *
 * When Supabase isn't configured, the auth pages keep their demo behavior and
 * never call these. The session itself is synced into the store by AuthProvider.
 */
export function useAuth() {
  const router = useRouter();
  const resetToDemo = useAuthStore((s) => s.resetToDemo);

  const signIn = React.useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: parseSupabaseError(error) };
      // Signed in with a password, so they have one: an admin can no longer
      // make a setup link for this account. Best effort, never blocks.
      void fetch("/api/auth/password-set", { method: "POST" }).catch(() => undefined);
      router.push("/dashboard");
      router.refresh();
      return { error: null };
    },
    [router],
  );

  const signUp = React.useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<SignUpResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error)
        return { error: parseSupabaseError(error), needsConfirmation: false };
      // No session back → email confirmation is required before sign-in.
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const signOut = React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetToDemo();
    router.push("/login");
    router.refresh();
  }, [resetToDemo, router]);

  return { isConfigured: isSupabaseConfigured, signIn, signUp, signOut };
}
