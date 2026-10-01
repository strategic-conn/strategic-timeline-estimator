"use client";

import * as React from "react";
import { toast } from "sonner";

import { useAccessibleHrefs } from "@/hooks/useNavAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TourTarget } from "@/lib/tours/ids";
import { isMobileViewport, runTour } from "@/lib/tours/run";
import type { TourContext, TourDef } from "@/lib/tours/tours";
import { useAuthStore } from "@/store/auth-store";
import { useTeamStore } from "@/store/team-store";
import { useTourStore, type TourProgress } from "@/store/tour-store";

/**
 * People who joined before tours shipped are not greeted as newcomers
 * (no welcome dialog, no checklist, no nudges) — just a one-time hint.
 * Compared against `profiles.confirmed_at`, i.e. when the invite was accepted.
 */
export const TOURS_LAUNCHED_AT = "2026-10-01T00:00:00Z";

/** Same id every other store keys "me" by. */
export function useTourUserId(): string {
  return useAuthStore((s) => s.user.authId ?? String(s.user.id));
}

/** This person's tour progress, or null until it has been read (live mode). */
export function useTourProgress(): TourProgress | null {
  const userId = useTourUserId();
  const progress = useTourStore((s) => s.byUser[userId]);
  const hydratedFor = useTourStore((s) => s.hydratedFor);
  if (isSupabaseConfigured && hydratedFor !== userId) return null;
  return progress ?? {};
}

/**
 * True for someone who joined after tours shipped, false for an existing
 * user, null while that is not known yet (the roster hydrates async).
 * Demo mode treats everyone as new.
 */
export function useIsNewUser(): boolean | null {
  const authId = useAuthStore((s) => s.user.authId);
  const members = useTeamStore((s) => s.members);
  const loaded = useTeamStore((s) => s.loaded);
  if (!isSupabaseConfigured) return true;
  if (!authId || !loaded) return null;
  const me = members.find((m) => m.id === authId);
  if (!me) return null;
  // No confirmation date is the bootstrap admin, who predates invites.
  if (!me.confirmed_at) return false;
  return Date.parse(me.confirmed_at) >= Date.parse(TOURS_LAUNCHED_AT);
}

/** Permissions + page access. `mobile` is filled in at the moment of use. */
export function useTourContext(): () => TourContext {
  const perms = usePermissions();
  const accessible = useAccessibleHrefs();
  return React.useCallback(
    () => ({ ...perms, accessible, mobile: isMobileViewport() }),
    [perms, accessible],
  );
}

/** Start a tour and record how it ended. */
export function useStartTour(): (def: TourDef, startAt?: TourTarget) => Promise<void> {
  const userId = useTourUserId();
  const getCtx = useTourContext();
  const record = useTourStore((s) => s.record);
  const setResume = useTourStore((s) => s.setResume);
  const setActive = useTourStore((s) => s.setActive);

  return React.useCallback(
    async (def, startAt) => {
      setActive(def.id);
      let outcome: Awaited<ReturnType<typeof runTour>>;
      try {
        outcome = await runTour(def, getCtx(), {
          startAt,
          onEnd: ({ status, lastIndex, lastTarget }) => {
            setActive(null);
            record(userId, def.id, def.version, status);
            // Offer "Resume" only for a tour actually left part-way.
            setResume(
              userId,
              status === "dismissed" && lastIndex > 0
                ? { tourId: def.id, target: lastTarget }
                : null,
            );
          },
        });
      } catch (err) {
        // e.g. the driver.js chunk failed to load. Never leave the Help
        // button disabled behind a tour that isn't there.
        console.error("Tour failed to start:", err);
        setActive(null);
        toast.error("Couldn't start the tour", {
          description: "Reload the page and try again.",
        });
        return;
      }
      if (outcome === "started") return;
      setActive(null);
      if (outcome === "blocked") {
        toast.message("Close the open window first", {
          description: "Then start the tour again from the ? button.",
        });
      } else {
        toast.message("Nothing to show here yet", {
          description: "This page's tour points at things that haven't loaded or don't exist yet.",
        });
      }
    },
    [getCtx, record, setActive, setResume, userId],
  );
}

/** Has this person seen the current version of a tour? */
export function seenTour(progress: TourProgress | null, def: TourDef): boolean {
  const entry = progress?.[def.id];
  return Boolean(entry && entry.version >= def.version);
}
