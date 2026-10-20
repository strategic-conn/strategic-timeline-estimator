"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { setWorkingHolidays } from "@/lib/calendar/us-holidays";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

/**
 * Which federal holidays the company WORKS (`holiday_settings`, 0049). Every
 * holiday is a day off unless listed here.
 *
 * The store is the source; `lib/calendar/us-holidays` is told about every
 * change (`setWorkingHolidays`) so the timeline, capacity, planner, PTO preview,
 * velocity and calendar all follow without importing this store.
 */
type HolidaySettingsState = {
  /** Names of holidays marked as working days. */
  working: string[];
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /** Admin only (RLS refuses anyone else). Optimistic, rolled back on failure. */
  setWorking: (name: string, working: boolean) => Promise<void>;
};

const apply = (working: string[]) => setWorkingHolidays(working);

export const useHolidaySettingsStore = create<HolidaySettingsState>()(
  persist(
    (set, get) => ({
      working: [],
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        const supabase = createClient();
        const { data, error } = await supabase
          .from("holiday_settings")
          .select("name, working");
        if (error) {
          // Keep every holiday a day off (the safe default) and say why.
          set({ loaded: true, error: parseSupabaseError(error) });
          return;
        }
        const working = (data ?? []).filter((r) => r.working).map((r) => r.name).sort();
        apply(working);
        set({ working, loaded: true, error: null });
      },

      setWorking: async (name, working) => {
        const before = get().working;
        const next = working
          ? [...new Set([...before, name])].sort()
          : before.filter((n) => n !== name);
        apply(next);
        set({ working: next });
        if (!isSupabaseConfigured) return;

        const supabase = createClient();
        const { error } = await supabase
          .from("holiday_settings")
          .upsert({ name, working }, { onConflict: "name" });
        if (error) {
          apply(before);
          set({ working: before });
          toast.error("Couldn't save the holiday", {
            description: parseSupabaseError(error),
          });
        }
      },
    }),
    {
      name: "timeline-holiday-settings",
      // Live mode reads the table on every load; only the demo keeps a copy.
      partialize: (s) => (isSupabaseConfigured ? {} : { working: s.working }),
      onRehydrateStorage: () => (s) => {
        if (s) apply(s.working);
      },
    },
  ),
);
