"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";

/** Default build sprint length, in weeks. */
export const DEFAULT_SPRINT_WEEKS = 2;
export const SPRINT_WEEK_OPTIONS = [1, 2, 3, 4] as const;

/**
 * Workspace-wide planning settings (`workspace_settings`, 0053) — one row.
 * Today: how many weeks a build sprint lasts. The estimate's people plan and
 * Start project read it when they lay work out in sprints.
 */
type WorkspaceSettingsState = {
  sprintWeeks: number;
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /** Admin only (RLS refuses anyone else). Optimistic, rolled back on failure. */
  setSprintWeeks: (weeks: number) => Promise<void>;
};

export const useWorkspaceSettingsStore = create<WorkspaceSettingsState>()(
  persist(
    (set, get) => ({
      sprintWeeks: DEFAULT_SPRINT_WEEKS,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        const supabase = createClient();
        const { data, error } = await supabase
          .from("workspace_settings")
          .select("sprint_weeks")
          .maybeSingle();
        if (error) {
          // Plan with the default and say why.
          set({ loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          sprintWeeks: data?.sprint_weeks ?? DEFAULT_SPRINT_WEEKS,
          loaded: true,
          error: null,
        });
      },

      setSprintWeeks: async (weeks) => {
        const before = get().sprintWeeks;
        if (weeks === before) return;
        set({ sprintWeeks: weeks });
        if (!isSupabaseConfigured) return;
        const supabase = createClient();
        const { error } = await supabase
          .from("workspace_settings")
          .upsert({ id: true, sprint_weeks: weeks }, { onConflict: "id" });
        if (error) {
          set({ sprintWeeks: before });
          toast.error("Couldn't save the sprint length", {
            description: parseSupabaseError(error),
          });
        }
      },
    }),
    {
      name: "timeline-workspace-settings",
      // Live mode reads the table on every load; only the demo keeps a copy.
      partialize: (s) => (isSupabaseConfigured ? {} : { sprintWeeks: s.sprintWeeks }),
    },
  ),
);
