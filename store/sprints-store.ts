"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { withProjectScope } from "@/lib/activity/project-label";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import { DUMMY_SPRINTS } from "@/lib/dummy/sprints.data";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import type { Database } from "@/types/database.types";
import { SPRINT_STATUSES, type Sprint, type SprintStatus } from "@/types/sprint.types";

function sprintStatusLabel(status: SprintStatus): string {
  return SPRINT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

type SprintRow = Database["public"]["Tables"]["sprints"]["Row"];

function rowToSprint(r: SprintRow): Sprint {
  return {
    id: r.id,
    project_id: r.project_id,
    name: r.name,
    goal: r.goal ?? undefined,
    status: r.status,
    start_date: r.start_date,
    end_date: r.end_date,
    position: r.position,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function nextSprintId(sprints: Sprint[]): string {
  let max = 0;
  for (const s of sprints) {
    const m = /^sprint-(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `sprint-${max + 1}`;
}

export type CreateSprintInput = Omit<
  Sprint,
  "id" | "position" | "created_at" | "updated_at"
>;

interface SprintsState {
  sprints: Sprint[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hydrateFromSupabase: () => Promise<void>;
  /** Merge a realtime INSERT/UPDATE (idempotent by id). */
  applyRealtimeUpsert: (row: SprintRow) => void;
  /** Remove a realtime-deleted sprint by id. */
  applyRealtimeDelete: (id: string) => void;
  createSprint: (payload: CreateSprintInput) => string;
  updateSprint: (id: string, partial: Partial<Sprint>) => void;
  deleteSprint: (id: string) => void;
  setSprintStatus: (id: string, status: SprintStatus) => void;
}

export const useSprintsStore = create<SprintsState>()(
  persist(
    (set, get) => ({
      sprints: isSupabaseConfigured ? [] : [...DUMMY_SPRINTS],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("sprints")
          .select("*")
          .order("position", { ascending: true });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          sprints: (data ?? []).map(rowToSprint),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      applyRealtimeUpsert: (row) =>
        set((s) => {
          const mapped = rowToSprint(row);
          const exists = s.sprints.some((sp) => sp.id === mapped.id);
          const sprints = exists
            ? s.sprints.map((sp) => (sp.id === mapped.id ? mapped : sp))
            : [...s.sprints, mapped];
          sprints.sort((a, b) => a.position - b.position);
          return { sprints };
        }),

      applyRealtimeDelete: (id) =>
        set((s) => ({ sprints: s.sprints.filter((sp) => sp.id !== id) })),

      createSprint: (payload) => {
        const siblings = get().sprints.filter(
          (s) => s.project_id === payload.project_id,
        );
        const position = siblings.length;
        const now = new Date().toISOString();

        if (!isSupabaseConfigured) {
          const before = structuredClone(get().sprints);
          const id = nextSprintId(get().sprints);
          const next: Sprint = {
            ...payload,
            id,
            position,
            created_at: now,
            updated_at: now,
          };
          set((s) => ({ sprints: [...s.sprints, next] }));
          offerUndoToast(
            "Sprint created",
            () => useSprintsStore.setState({ sprints: before }),
            next.name,
          );
          pushWorkspaceActivity(
            withProjectScope(`Created sprint "${next.name}"`, next.project_id),
            sprintTasksHref(next.project_id, id),
            next.project_id,
          );
          return id;
        }

        // Real id client-side so an immediately-opened sprint board never
        // routes on a throwaway id (see projects-store for the rationale).
        const id = crypto.randomUUID();
        void (async () => {
          const optimistic: Sprint = {
            ...payload,
            id,
            position,
            created_at: now,
            updated_at: now,
          };
          set((s) => ({ sprints: [...s.sprints, optimistic] }));

          const supabase = createClient();
          const { data, error } = await supabase
            .from("sprints")
            .insert({
              id,
              project_id: payload.project_id,
              name: payload.name,
              goal: payload.goal ?? null,
              status: payload.status,
              start_date: payload.start_date,
              end_date: payload.end_date,
              position,
            })
            .select()
            .single();

          if (error || !data) {
            set((s) => ({ sprints: s.sprints.filter((sp) => sp.id !== id) }));
            toast.error("Couldn't create sprint", {
              description: parseSupabaseError(error),
            });
            return;
          }
          const saved = rowToSprint(data);
          set((s) => ({
            sprints: s.sprints.map((sp) => (sp.id === id ? saved : sp)),
          }));
          toast.success("Sprint created");
          pushWorkspaceActivity(
            withProjectScope(`Created sprint "${saved.name}"`, saved.project_id),
            sprintTasksHref(saved.project_id, saved.id),
            saved.project_id,
          );
        })();
        return id;
      },

      updateSprint: (id, partial) => {
        const prev = get().sprints.find((sp) => sp.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const now = new Date().toISOString();
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id ? { ...sp, ...partial, updated_at: now } : sp,
          ),
        }));

        if (!isSupabaseConfigured) {
          offerUndoToast("Sprint updated", () =>
            useSprintsStore.setState((s) => ({
              sprints: s.sprints.map((sp) =>
                sp.id === id ? structuredClone(snapshot) : sp,
              ),
            })),
          );
          const merged = get().sprints.find((sp) => sp.id === id)!;
          pushWorkspaceActivity(
            withProjectScope(`Updated sprint "${merged.name}"`, merged.project_id),
            sprintTasksHref(merged.project_id, id),
            merged.project_id,
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          const fields: Database["public"]["Tables"]["sprints"]["Update"] = {
            updated_at: now,
          };
          if (partial.name !== undefined) fields.name = partial.name;
          if (partial.goal !== undefined) fields.goal = partial.goal ?? null;
          if (partial.status !== undefined) fields.status = partial.status;
          if (partial.start_date !== undefined) fields.start_date = partial.start_date;
          if (partial.end_date !== undefined) fields.end_date = partial.end_date;
          if (partial.position !== undefined) fields.position = partial.position;

          const { error } = await supabase.from("sprints").update(fields).eq("id", id);
          if (error) {
            set((s) => ({
              sprints: s.sprints.map((sp) =>
                sp.id === id ? structuredClone(snapshot) : sp,
              ),
            }));
            toast.error("Couldn't update sprint", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success("Sprint updated");
          const merged = get().sprints.find((sp) => sp.id === id);
          if (merged) {
            pushWorkspaceActivity(
              withProjectScope(`Updated sprint "${merged.name}"`, merged.project_id),
              sprintTasksHref(merged.project_id, id),
              merged.project_id,
            );
          }
        })();
      },

      deleteSprint: (id) => {
        const before = structuredClone(get().sprints);
        const prev = get().sprints.find((sp) => sp.id === id);
        set((s) => ({ sprints: s.sprints.filter((sp) => sp.id !== id) }));

        if (!isSupabaseConfigured) {
          offerUndoToast("Sprint deleted", () =>
            useSprintsStore.setState({ sprints: before }),
          );
          if (prev) {
            pushWorkspaceActivity(
              withProjectScope(`Deleted sprint "${prev.name}"`, prev.project_id),
              backlogHref(prev.project_id),
              prev.project_id,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase.from("sprints").delete().eq("id", id);
          if (error) {
            set({ sprints: before });
            toast.error("Couldn't delete sprint", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success("Sprint deleted");
          if (prev) {
            pushWorkspaceActivity(
              withProjectScope(`Deleted sprint "${prev.name}"`, prev.project_id),
              backlogHref(prev.project_id),
              prev.project_id,
            );
          }
        })();
      },

      setSprintStatus: (id, status) => {
        const prev = get().sprints.find((sp) => sp.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const now = new Date().toISOString();
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id ? { ...sp, status, updated_at: now } : sp,
          ),
        }));

        const msg =
          status === "active"
            ? `started sprint "${prev.name}"`
            : status === "completed"
              ? `completed sprint "${prev.name}"`
              : `set sprint "${prev.name}" to ${sprintStatusLabel(status)}`;

        if (!isSupabaseConfigured) {
          offerUndoToast("Sprint status updated", () =>
            useSprintsStore.setState((s) => ({
              sprints: s.sprints.map((sp) =>
                sp.id === id ? structuredClone(snapshot) : sp,
              ),
            })),
          );
          pushWorkspaceActivity(withProjectScope(msg, prev.project_id), sprintTasksHref(prev.project_id, id), prev.project_id);
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("sprints")
            .update({ status, updated_at: now })
            .eq("id", id);
          if (error) {
            set((s) => ({
              sprints: s.sprints.map((sp) =>
                sp.id === id ? structuredClone(snapshot) : sp,
              ),
            }));
            toast.error("Couldn't update sprint", {
              description: parseSupabaseError(error),
            });
            return;
          }
          pushWorkspaceActivity(withProjectScope(msg, prev.project_id), sprintTasksHref(prev.project_id, id), prev.project_id);
        })();
      },
    }),
    {
      name: "timeline-sprints",
      version: 2,
      partialize: (s) =>
        isSupabaseConfigured ? { sprints: [] } : { sprints: s.sprints },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return { ...(persisted as object), sprints: [] } as unknown as SprintsState;
        }
        return persisted as SprintsState;
      },
    },
  ),
);
