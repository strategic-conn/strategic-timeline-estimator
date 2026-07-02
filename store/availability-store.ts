"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { formatYmdLocal } from "@/lib/utils/availability-dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import type { Database } from "@/types/database.types";
import type {
  AvailabilityEntry,
  AvailabilityEntryKind,
} from "@/types/availability.types";

type AvailabilityRow = Database["public"]["Tables"]["availability_entries"]["Row"];

function rowToEntry(r: AvailabilityRow): AvailabilityEntry {
  return {
    id: r.id,
    user_id: r.user_id,
    start_date: r.start_date,
    end_date: r.end_date,
    kind: r.kind,
    note: r.note ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function daysFromTodayYmd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return formatYmdLocal(d);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Demo entries so the calendar is not empty before users add their own. */
const SEED_ENTRIES: AvailabilityEntry[] = [
  {
    id: "avail-seed-1",
    user_id: "3",
    start_date: daysFromTodayYmd(14),
    end_date: daysFromTodayYmd(16),
    kind: "pto",
    note: "Annual leave",
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "avail-seed-2",
    user_id: "4",
    start_date: daysFromTodayYmd(3),
    end_date: daysFromTodayYmd(3),
    kind: "partial",
    note: "Morning only",
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

export type CreateAvailabilityInput = {
  user_id: string;
  start_date: string;
  end_date: string;
  kind: AvailabilityEntryKind;
  note?: string;
};

interface AvailabilityState {
  entries: AvailabilityEntry[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Pull all availability entries from Supabase (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  addEntry: (input: CreateAvailabilityInput) => AvailabilityEntry;
  updateEntry: (
    id: string,
    userId: string,
    partial: Partial<
      Pick<AvailabilityEntry, "start_date" | "end_date" | "kind" | "note">
    >
  ) => void;
  deleteEntry: (id: string, userId: string) => void;
}

export const useAvailabilityStore = create<AvailabilityState>()(
  persist(
    (set, get) => ({
      // Live mode starts empty and hydrates from Supabase; demo seeds locally.
      entries: isSupabaseConfigured ? [] : [...SEED_ENTRIES],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        // Everyone's entries — the calendar shows the whole team (RLS read = auth).
        const { data, error } = await supabase
          .from("availability_entries")
          .select("*")
          .order("start_date", { ascending: true });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          entries: (data ?? []).map(rowToEntry),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      addEntry: (input) => {
        const t = nowIso();
        // Real id client-side (see projects-store) so the optimistic row already
        // carries its final UUID — no temp→real swap.
        const id = isSupabaseConfigured ? crypto.randomUUID() : uid();
        const entry: AvailabilityEntry = {
          id,
          user_id: input.user_id,
          start_date: input.start_date,
          end_date: input.end_date,
          kind: input.kind,
          note: input.note?.trim() || undefined,
          created_at: t,
          updated_at: t,
        };
        set((s) => ({ entries: [entry, ...s.entries] }));

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase.from("availability_entries").insert({
              id,
              user_id: entry.user_id,
              start_date: entry.start_date,
              end_date: entry.end_date,
              kind: entry.kind,
              note: entry.note ?? null,
            });
            if (error) {
              set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
              toast.error("Couldn't save time off", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }

        return entry;
      },

      updateEntry: (id, userId, partial) => {
        const prev = get().entries.find(
          (e) => e.id === id && e.user_id === userId
        );
        if (!prev) return;
        const snapshot = structuredClone(prev);
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id && e.user_id === userId
              ? {
                  ...e,
                  ...partial,
                  note:
                    partial.note !== undefined
                      ? partial.note?.trim() || undefined
                      : e.note,
                  updated_at: nowIso(),
                }
              : e
          ),
        }));

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const fields: Database["public"]["Tables"]["availability_entries"]["Update"] =
              { updated_at: nowIso() };
            if (partial.start_date !== undefined)
              fields.start_date = partial.start_date;
            if (partial.end_date !== undefined) fields.end_date = partial.end_date;
            if (partial.kind !== undefined) fields.kind = partial.kind;
            if (partial.note !== undefined)
              fields.note = partial.note?.trim() || null;

            const { error } = await supabase
              .from("availability_entries")
              .update(fields)
              .eq("id", id);
            if (error) {
              set((s) => ({
                entries: s.entries.map((e) =>
                  e.id === id ? structuredClone(snapshot) : e
                ),
              }));
              toast.error("Couldn't update time off", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }
      },

      deleteEntry: (id, userId) => {
        const before = structuredClone(get().entries);
        set((s) => ({
          entries: s.entries.filter(
            (e) => !(e.id === id && e.user_id === userId)
          ),
        }));

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase
              .from("availability_entries")
              .delete()
              .eq("id", id);
            if (error) {
              set({ entries: before });
              toast.error("Couldn't remove time off", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }
      },
    }),
    {
      name: "timeline-availability",
      version: 2,
      partialize: (s) =>
        isSupabaseConfigured ? { entries: [] } : { entries: s.entries },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            entries: [],
          } as unknown as AvailabilityState;
        }
        return persisted as AvailabilityState;
      },
    }
  )
);
