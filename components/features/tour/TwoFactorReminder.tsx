"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useHasTwoFactor } from "@/hooks/useHasTwoFactor";
import { shouldRemindTwoFactor } from "@/lib/auth/mfa-gate";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useTourStore } from "@/store/tour-store";
import {
  useIsNewUser,
  useTourProgress,
  useTourUserId,
} from "@/components/features/tour/use-tours";

/**
 * "Protect your account" — a toast for people without two-factor, at most once
 * every TWO_FACTOR_REMIND_DAYS. The showing itself is recorded (tour_progress
 * `2fa-reminder`), so "Not now", closing it, or ignoring it all wait the same
 * 14 days, on every device. Stops for good once they have an authenticator.
 *
 * Stays out of the way of onboarding: not on Settings (the card is there), not
 * during a tour, and not for a newcomer until the welcome dialog is answered.
 */
export function TwoFactorReminder() {
  const router = useRouter();
  const pathname = usePathname();
  const userId = useTourUserId();
  const progress = useTourProgress();
  const isNew = useIsNewUser();
  const record = useTourStore((s) => s.record);
  const active = useTourStore((s) => s.active);
  const pending = useTourStore((s) => s.pending);
  const hasFactor = useHasTwoFactor();

  React.useEffect(() => {
    if (!isSupabaseConfigured || progress == null || isNew == null) return;
    if (isNew && !progress.welcome) return;
    if (active || pending || pathname.startsWith("/settings")) return;
    if (
      !shouldRemindTwoFactor({
        hasFactor,
        last: progress["2fa-reminder"],
        now: Date.now(),
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      record(userId, "2fa-reminder", 1, "dismissed");
      toast("Protect your account", {
        description:
          "Turn on two-factor sign-in: a code from an authenticator app on your phone, so a leaked password alone can't get in.",
        duration: 15000,
        action: { label: "Set up", onClick: () => router.push("/settings?tab=security") },
        cancel: { label: "Not now", onClick: () => {} },
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [hasFactor, progress, isNew, active, pending, pathname, record, router, userId]);

  return null;
}
