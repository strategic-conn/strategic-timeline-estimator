"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TourTarget } from "@/lib/tours/ids";

export type TourStatus = "completed" | "dismissed";
export type TourEntry = { version: number; status: TourStatus; at: string };
/** tour id → entry. Also holds non-tour keys: "checklist", "intro-hint". */
export type TourProgress = Record<string, TourEntry>;

/** "Show me" handoff: navigate, then start this tour at this step. */
export type PendingTour = { tourId: string; target?: TourTarget };

type TourState = {
  /** Keyed by user id, so a shared browser keeps two people apart. */
  byUser: Record<string, TourProgress>;
  /** Tours a first-visit nudge was already shown for. Local only. */
  nudged: Record<string, string[]>;
  /** A tour left part-way, to offer "Resume" from the Help menu. */
  resume: Record<string, { tourId: string; target?: TourTarget }>;
  /** User id whose live progress has been read (live mode). */
  hydratedFor: string | null;
  /** Not persisted: the tour currently on screen. */
  active: string | null;
  /** Not persisted: a "Show me" waiting for its page to render. */
  pending: PendingTour | null;
  /** Not persisted: "Later" on the welcome dialog — ask again next visit. */
  welcomeDeferred: boolean;
  /**
   * Not persisted: the checklist was reopened from the Help menu, so it shows
   * this session even for an existing user or after it was dismissed.
   */
  checklistOpen: boolean;

  hydrateFromSupabase: (userId: string) => Promise<void>;
  record: (userId: string, tourId: string, version: number, status: TourStatus) => void;
  forget: (userId: string, tourId: string) => void;
  resetAll: (userId: string) => void;
  markNudged: (userId: string, tourId: string) => void;
  setResume: (userId: string, value: { tourId: string; target?: TourTarget } | null) => void;
  setActive: (tourId: string | null) => void;
  setPending: (pending: PendingTour | null) => void;
  deferWelcome: () => void;
  openChecklist: () => void;
  closeChecklist: () => void;
};

/**
 * Which onboarding tours each person has seen (`tour_progress`, 0045).
 *
 * The usual synced-store bridge with one deliberate difference: a failed write
 * is NOT rolled back. The local copy is kept, so the person is not re-nagged in
 * this browser; the worst case is being offered a tour again on another device.
 * Rolling back would re-show a dialog they had just closed, for a failure they
 * cannot do anything about.
 *
 * Progress is also persisted locally in live mode (unlike other stores) so the
 * welcome dialog does not flash before the read returns.
 */
export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      byUser: {},
      nudged: {},
      resume: {},
      hydratedFor: null,
      active: null,
      pending: null,
      welcomeDeferred: false,
      checklistOpen: false,

      hydrateFromSupabase: async (userId) => {
        if (!isSupabaseConfigured) return;
        const supabase = createClient();
        const { data, error } = await supabase
          .from("tour_progress")
          .select("tour_id, version, status, updated_at");
        if (error) {
          // Table missing or unreachable: carry on with the local copy rather
          // than showing the welcome dialog to someone who already closed it.
          console.warn("tour_progress read failed:", error.message);
          set({ hydratedFor: userId });
          return;
        }
        const local = get().byUser[userId] ?? {};
        const merged: TourProgress = { ...local };
        for (const r of data ?? []) {
          const mine = local[r.tour_id];
          // Newest wins, so a write that failed earlier is not lost here.
          if (!mine || mine.at < r.updated_at) {
            merged[r.tour_id] = {
              version: r.version,
              status: r.status as TourStatus,
              at: r.updated_at,
            };
          }
        }
        set((s) => ({
          byUser: { ...s.byUser, [userId]: merged },
          hydratedFor: userId,
        }));
      },

      record: (userId, tourId, version, status) => {
        const entry: TourEntry = { version, status, at: new Date().toISOString() };
        set((s) => ({
          byUser: {
            ...s.byUser,
            [userId]: { ...(s.byUser[userId] ?? {}), [tourId]: entry },
          },
        }));
        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tour_progress")
            .upsert(
              { profile_id: userId, tour_id: tourId, version, status },
              { onConflict: "profile_id,tour_id" },
            );
          if (error) console.warn("tour_progress write failed:", error.message);
        })();
      },

      forget: (userId, tourId) => {
        set((s) => {
          const mine = { ...(s.byUser[userId] ?? {}) };
          delete mine[tourId];
          return { byUser: { ...s.byUser, [userId]: mine } };
        });
        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tour_progress")
            .delete()
            .eq("profile_id", userId)
            .eq("tour_id", tourId);
          if (error) console.warn("tour_progress delete failed:", error.message);
        })();
      },

      resetAll: (userId) => {
        set((s) => {
          const byUser = { ...s.byUser, [userId]: {} };
          const nudged = { ...s.nudged, [userId]: [] };
          const resume = { ...s.resume };
          delete resume[userId];
          return { byUser, nudged, resume };
        });
        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tour_progress")
            .delete()
            .eq("profile_id", userId);
          if (error) console.warn("tour_progress reset failed:", error.message);
        })();
      },

      markNudged: (userId, tourId) =>
        set((s) => {
          const list = s.nudged[userId] ?? [];
          if (list.includes(tourId)) return s;
          return { nudged: { ...s.nudged, [userId]: [...list, tourId] } };
        }),

      setResume: (userId, value) =>
        set((s) => {
          const resume = { ...s.resume };
          if (value) resume[userId] = value;
          else delete resume[userId];
          return { resume };
        }),

      setActive: (active) => set({ active }),
      setPending: (pending) => set({ pending }),
      deferWelcome: () => set({ welcomeDeferred: true }),
      openChecklist: () => set({ checklistOpen: true }),
      closeChecklist: () => set({ checklistOpen: false }),
    }),
    {
      name: "timeline-tours",
      version: 1,
      partialize: (s) => ({ byUser: s.byUser, nudged: s.nudged, resume: s.resume }),
    },
  ),
);
