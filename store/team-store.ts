"use client";

import { useMemo } from "react";
import { create } from "zustand";

import { deriveInitials } from "@/lib/utils/initials";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import type { Database } from "@/types/database.types";
import type { TeamMember } from "@/types/task.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const AVATAR_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

/** Stable color per profile id so avatars are consistent across reloads. */
function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function rowToMember(r: ProfileRow): TeamMember {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatar_url: r.avatar_url ?? "",
    initials: deriveInitials(r.name),
    avatarColor: colorForId(r.id),
    page_access: r.page_access ?? null,
    deactivated_at: r.deactivated_at ?? null,
    confirmed_at: r.confirmed_at ?? null,
  };
}

interface TeamState {
  members: TeamMember[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /**
   * Realtime echo (0037). The roster is the DENOMINATOR of the availability
   * factor, so somebody joining or being deactivated changes everyone else's
   * share of each absence — and therefore every tentative timeline.
   */
  applyRealtimeUpsert: (row: ProfileRow) => void;
  applyRealtimeDelete: (id: string) => void;
}

/**
 * The team directory. In live mode it holds real `profiles`; in demo mode it
 * mirrors TEAM_MEMBERS so every consumer can read people from one place.
 */
export const useTeamStore = create<TeamState>()((set) => ({
  members: isSupabaseConfigured ? [] : [...TEAM_MEMBERS],
  loading: isSupabaseConfigured,
  loaded: !isSupabaseConfigured,
  error: null,

  hydrateFromSupabase: async () => {
    if (!isSupabaseConfigured) return;
    set({ loading: true, error: null });
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      set({ loading: false, loaded: true, error: parseSupabaseError(error) });
      return;
    }
    set({
      members: (data ?? []).map(rowToMember),
      loading: false,
      loaded: true,
      error: null,
    });
  },

  applyRealtimeUpsert: (row) => {
    const member = rowToMember(row);
    set((s) => {
      const i = s.members.findIndex((m) => m.id === member.id);
      if (i === -1) {
        // Keep the alphabetical order `hydrateFromSupabase` established —
        // a new joiner appearing at the bottom of every picker would read as
        // a bug the next time somebody scanned the list.
        const next = [...s.members, member];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return { members: next };
      }
      const next = [...s.members];
      next[i] = member;
      return { members: next };
    });
  },

  applyRealtimeDelete: (id) => {
    set((s) => ({ members: s.members.filter((m) => m.id !== id) }));
  },
}));

/** Reactive list of team members (real profiles in live mode, demo otherwise). */
export function useTeamMembers(): TeamMember[] {
  return useTeamStore((s) => s.members);
}

/**
 * Active members only — for assignee/teammate pickers. Excludes deactivated
 * members and pending invitees (never accepted → can't be assigned work).
 */
export function useActiveTeamMembers(): TeamMember[] {
  const members = useTeamStore((s) => s.members);
  return useMemo(
    () => members.filter((m) => !m.deactivated_at && m.confirmed_at),
    [members],
  );
}

/** Members who have accepted their invite — for the Team directory. */
export function useJoinedTeamMembers(): TeamMember[] {
  const members = useTeamStore((s) => s.members);
  return useMemo(() => members.filter((m) => m.confirmed_at), [members]);
}
