"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/constants/workload";
import { DEMO_WEEKLY_HOURS } from "@/lib/dummy/tasks.data";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

const MIN_H = 1;
const MAX_H = 168;

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_WEEKLY_CAPACITY_HOURS;
  return Math.min(MAX_H, Math.max(MIN_H, Math.round(h)));
}

/** Pure read for selectors / memo (same rules as store). */
export function getEffectiveWeeklyHours(
  overrides: Record<string, number>,
  memberId: string
): number {
  const raw = overrides[memberId];
  if (raw != null && Number.isFinite(raw) && raw > 0) {
    return clampHours(raw);
  }
  return DEFAULT_WEEKLY_CAPACITY_HOURS;
}

type WeeklyCapacityState = {
  /** Keyed by team member id (string) for stable JSON persist. */
  overrides: Record<string, number>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Pull all per-person weekly hours from Supabase (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  setWeeklyHours: (memberId: string, hours: number) => void;
  getWeeklyHours: (memberId: string) => number;
};

export const useWeeklyCapacityStore = create<WeeklyCapacityState>()(
  persist(
    (set, get) => ({
      overrides: isSupabaseConfigured ? {} : DEMO_WEEKLY_HOURS,
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("weekly_capacity")
          .select("*");
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        const overrides: Record<string, number> = {};
        for (const row of data ?? []) {
          overrides[row.profile_id] = clampHours(row.hours_per_week);
        }
        set({ overrides, loading: false, loaded: true, error: null });
      },

      setWeeklyHours: (memberId, hours) => {
        const clamped = clampHours(hours);
        const prev = get().overrides[memberId];
        set((s) => ({
          overrides: { ...s.overrides, [memberId]: clamped },
        }));

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase
              .from("weekly_capacity")
              .upsert(
                { profile_id: memberId, hours_per_week: clamped },
                { onConflict: "profile_id" }
              );
            if (error) {
              // Roll back to the previous value (or clear if there wasn't one).
              set((s) => {
                const next = { ...s.overrides };
                if (prev === undefined) delete next[memberId];
                else next[memberId] = prev;
                return { overrides: next };
              });
              toast.error("Couldn't save weekly hours", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }
      },

      getWeeklyHours: (memberId) =>
        getEffectiveWeeklyHours(get().overrides, memberId),
    }),
    {
      name: "timeline-weekly-capacity",
      version: 3,
      partialize: (s) =>
        isSupabaseConfigured ? { overrides: {} } : { overrides: s.overrides },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            overrides: {},
          } as unknown as WeeklyCapacityState;
        }
        // Demo: seed dev hours, but keep any the user already set.
        const p = persisted as WeeklyCapacityState | undefined;
        return {
          ...(p ?? {}),
          overrides: { ...DEMO_WEEKLY_HOURS, ...(p?.overrides ?? {}) },
        } as unknown as WeeklyCapacityState;
      },
    }
  )
);
