"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { notifyUsers, pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { formatYmdLocal } from "@/lib/utils/availability-dates";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import type { Database } from "@/types/database.types";
import { useAuthStore } from "@/store/auth-store";
import { useTeamStore } from "@/store/team-store";
import type {
  AvailabilityEntry,
  AvailabilityEntryKind,
  AvailabilityStatus,
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
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    review_note: r.review_note,
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

/** Everyone who can decide a request — admin + manager, mirroring 0034. */
function approverIds(): string[] {
  return useTeamStore
    .getState()
    .members.filter(
      (m) => !m.deactivated_at && (m.role === "admin" || m.role === "manager"),
    )
    .map((m) => m.id);
}

function rangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} – ${end}`;
}

/** Did an edit move the dates? A note-only tweak must not re-open a decision. */
function datesChanged(
  prev: Pick<AvailabilityEntry, "start_date" | "end_date">,
  partial: Partial<Pick<AvailabilityEntry, "start_date" | "end_date">>
): boolean {
  return (
    (partial.start_date !== undefined && partial.start_date !== prev.start_date) ||
    (partial.end_date !== undefined && partial.end_date !== prev.end_date)
  );
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
    status: "approved",
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
    status: "pending",
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
  /**
   * Approve or reject a request. Admin/manager only — the
   * `prevent_self_approval` trigger (0034) is the real gate, this mirrors it.
   */
  reviewEntry: (
    id: string,
    decision: Exclude<AvailabilityStatus, "pending">,
    note?: string
  ) => void;
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
        // What RLS lets this person see: their own rows, or everyone's for an
        // admin/manager (0034 narrowed this from "any authenticated user").
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
        /**
         * An approver's entry is a fact; anyone else's is a request.
         *
         * Mirrors the `prevent_self_approval` trigger (0034), which forces
         * `pending` for a non-approver regardless of what the client sends — so
         * this is the UI telling the truth about what will happen, not the gate.
         */
        const role = useAuthStore.getState().user.role;
        const status: AvailabilityStatus =
          role === "admin" || role === "manager" ? "approved" : "pending";
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
          status,
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
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
              status,
            });
            if (error) {
              set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
              toast.error("Couldn't save time off", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }

        // Tell the approvers. Without this a request sits in a settings tab
        // nobody has a reason to open, which is how "pending" turns into
        // "ignored" and the person books the flight anyway.
        if (status === "pending") {
          notifyUsers(
            approverIds(),
            `${useAuthStore.getState().user.name?.trim() || "Someone"} requested time off (${rangeLabel(entry.start_date, entry.end_date)})`,
            "/settings",
          );
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
                  // Changing the dates of a decided request re-opens it. The
                  // trigger clears the old verdict server-side; keeping
                  // "approved" here would show granted leave for dates nobody
                  // ever agreed to.
                  ...(e.status === "rejected" ||
                  (e.status === "approved" && datesChanged(e, partial))
                    ? {
                        status: "pending" as AvailabilityStatus,
                        reviewed_by: null,
                        reviewed_at: null,
                      }
                    : {}),
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
            if (
              prev.status === "rejected" ||
              (prev.status === "approved" && datesChanged(prev, partial))
            ) {
              fields.status = "pending";
              fields.reviewed_by = null;
              fields.reviewed_at = null;
            }

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

      reviewEntry: (id, decision, note) => {
        const prev = get().entries.find((e) => e.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const reviewer = useAuthStore.getState().user.authId ?? null;
        const at = nowIso();
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: decision,
                  reviewed_by: reviewer,
                  reviewed_at: at,
                  review_note: note?.trim() || null,
                  updated_at: at,
                }
              : e
          ),
        }));

        const verb = decision === "approved" ? "approved" : "declined";
        // `includeSelf`: an approver deciding their own entry is rare but real,
        // and the usual "don't notify the actor" rule would silently drop it.
        notifyUsers(
          [prev.user_id],
          `Your time off (${rangeLabel(prev.start_date, prev.end_date)}) was ${verb}${note?.trim() ? `: "${note.trim()}"` : ""}`,
          "/settings",
          null,
          { includeSelf: true },
        );
        pushWorkspaceActivity(
          `${verb} a time-off request (${rangeLabel(prev.start_date, prev.end_date)})`,
          "/calendar",
        );

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("availability_entries")
            .update({
              status: decision,
              reviewed_by: reviewer,
              reviewed_at: at,
              review_note: note?.trim() || null,
              updated_at: at,
            })
            .eq("id", id);
          if (error) {
            // Roll back: an approval that only happened in this browser would
            // have the requester and the roster disagreeing about who is away.
            set((s) => ({
              entries: s.entries.map((e) =>
                e.id === id ? structuredClone(snapshot) : e
              ),
            }));
            toast.error("Couldn't save the decision", {
              description: parseSupabaseError(error),
            });
          }
        })();
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
