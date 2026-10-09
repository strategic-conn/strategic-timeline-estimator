"use client";

import * as React from "react";

import { startOfWeekIso } from "@/lib/constants/workload";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useTasksDataStore } from "@/store/tasks-store";

/**
 * Hours each person has logged since Monday, keyed by `profile_id`.
 *
 * ⚠️ Read from **`time_entries`**, never `tasks.logged_hours`. That column is
 * the TASK's cached total and credits every assignee in full, so summing it per
 * member double-counts shared work — the rule in CLAUDE.md's "one definition
 * per number". `time_entries` has one row per logger, which is the only source
 * that can answer a per-person question.
 *
 * Extracted from `WorkloadClient` when the dashboard needed the same figure: a
 * second copy of this query is a second chance for the two pages to disagree
 * about the same person in the same week.
 *
 * Re-runs when the workspace's total logged hours changes — logging time
 * writes the task's cached total too, so that sum moves exactly when a new
 * entry exists. Keying on `tasks` refetched on every drag, rename and status
 * flip.
 *
 * ⚠️ Returns **`null` until the read resolves**, and always in demo mode (there
 * is no `time_entries` table there). That is not pedantry: "nobody has logged
 * anything this week" and "we do not know yet" look identical as `0`, and the
 * personal card renders "—" plus full remaining capacity for the second. An
 * empty object would have made it claim 0h logged for a moment on every load.
 */
export function useWeekLoggedHours(): Record<string, number> | null {
  const loggedTotal = useTasksDataStore((s) =>
    s.tasks.reduce((sum, t) => sum + (t.logged_hours ?? 0), 0),
  );
  const [logged, setLogged] = React.useState<Record<string, number> | null>(
    null,
  );

  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("time_entries")
        .select("profile_id, hours")
        .gte("logged_at", startOfWeekIso());
      if (!active) return;
      const map: Record<string, number> = {};
      for (const r of data ?? [])
        map[r.profile_id] = (map[r.profile_id] ?? 0) + Number(r.hours);
      setLogged(map);
    })();
    return () => {
      active = false;
    };
  }, [loggedTotal]);

  return logged;
}
