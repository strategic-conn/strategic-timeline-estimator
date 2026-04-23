"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { formatYmdLocal } from "@/lib/utils/availability-dates";
import type {
  AvailabilityEntry,
  AvailabilityEntryKind,
} from "@/types/availability.types";

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
    user_id: 3,
    start_date: daysFromTodayYmd(14),
    end_date: daysFromTodayYmd(16),
    kind: "pto",
    note: "Annual leave",
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "avail-seed-2",
    user_id: 4,
    start_date: daysFromTodayYmd(3),
    end_date: daysFromTodayYmd(3),
    kind: "partial",
    note: "Morning only",
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

export type CreateAvailabilityInput = {
  user_id: number;
  start_date: string;
  end_date: string;
  kind: AvailabilityEntryKind;
  note?: string;
};

interface AvailabilityState {
  entries: AvailabilityEntry[];
  addEntry: (input: CreateAvailabilityInput) => AvailabilityEntry;
  updateEntry: (
    id: string,
    userId: number,
    partial: Partial<
      Pick<AvailabilityEntry, "start_date" | "end_date" | "kind" | "note">
    >
  ) => void;
  deleteEntry: (id: string, userId: number) => void;
}

export const useAvailabilityStore = create<AvailabilityState>()(
  persist(
    (set) => ({
      entries: [...SEED_ENTRIES],

      addEntry: (input) => {
        const t = nowIso();
        const entry: AvailabilityEntry = {
          id: uid(),
          user_id: input.user_id,
          start_date: input.start_date,
          end_date: input.end_date,
          kind: input.kind,
          note: input.note?.trim() || undefined,
          created_at: t,
          updated_at: t,
        };
        set((s) => ({ entries: [entry, ...s.entries] }));
        return entry;
      },

      updateEntry: (id, userId, partial) =>
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
        })),

      deleteEntry: (id, userId) =>
        set((s) => ({
          entries: s.entries.filter(
            (e) => !(e.id === id && e.user_id === userId)
          ),
        })),
    }),
    { name: "timeline-availability", version: 1 }
  )
);
