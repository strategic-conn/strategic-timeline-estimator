"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import { pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { projectOverviewHref } from "@/lib/constants/sprints";
import { DUMMY_PROJECTS } from "@/lib/dummy/projects.data";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import { useAuthStore } from "@/store/auth-store";
import type { Database } from "@/types/database.types";
import type { Project, ProjectStatus } from "@/types/project.types";

const PROJECT_STATUS_WORD: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    status: r.status,
    owner_id: r.owner_id,
    risk_buffer_pct: r.risk_buffer_pct ?? 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function nextProjectId(projects: Project[]): string {
  let max = 0;
  for (const p of projects) {
    const m = /^proj-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `proj-${max + 1}`;
}

export type CreateProjectInput = Omit<
  Project,
  "id" | "created_at" | "updated_at"
>;

interface ProjectsState {
  projects: Project[];
  /** True while the first Supabase fetch is in flight (live mode only). */
  loading: boolean;
  /** True once a fetch has resolved (or immediately in demo mode). */
  loaded: boolean;
  error: string | null;
  /** Pull projects from Supabase into the store (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  /** Merge a realtime INSERT/UPDATE (idempotent by id). */
  applyRealtimeUpsert: (row: ProjectRow) => void;
  /** Remove a realtime-deleted project by id. */
  applyRealtimeDelete: (id: string) => void;
  /** Create a project; returns its id (client-generated in live mode). */
  createProject: (payload: CreateProjectInput) => string;
  updateProject: (id: string, partial: Partial<Project>) => void;
  archiveProject: (id: string) => void;
  deleteProject: (id: string) => void;
  setStatus: (id: string, status: ProjectStatus) => void;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      // Live mode starts empty and hydrates from Supabase; demo seeds locally.
      projects: isSupabaseConfigured ? [] : [...DUMMY_PROJECTS],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        set({
          projects: (data ?? []).map(rowToProject),
          loading: false,
          loaded: true,
          error: null,
        });
      },

      applyRealtimeUpsert: (row) =>
        set((s) => {
          const mapped = rowToProject(row);
          const exists = s.projects.some((p) => p.id === mapped.id);
          const projects = exists
            ? s.projects.map((p) => (p.id === mapped.id ? mapped : p))
            : [mapped, ...s.projects];
          projects.sort(
            (a, b) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime(),
          );
          return { projects };
        }),

      applyRealtimeDelete: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      createProject: (payload) => {
        if (!isSupabaseConfigured) {
          const before = structuredClone(get().projects);
          const id = nextProjectId(get().projects);
          const now = new Date().toISOString();
          const next: Project = {
            ...payload,
            id,
            created_at: now,
            updated_at: now,
          };
          set((s) => ({ projects: [next, ...s.projects] }));
          offerUndoToast(
            "Project created",
            () => useProjectsStore.setState({ projects: before }),
            next.name,
          );
          pushWorkspaceActivity(
            `Created project "${next.name}"`,
            projectOverviewHref(id),
            id,
          );
          return id;
        }

        // ── Supabase: optimistic insert with a client-generated UUID (no
        // temp→real swap), reconcile on response. The id is generated up front
        // so callers (e.g. proposal→project convert) can use it immediately.
        const id = crypto.randomUUID();
        void (async () => {
          const ownerId = useAuthStore.getState().user.authId;
          if (!ownerId) {
            toast.error("Couldn't create project", {
              description: "You need to be signed in.",
            });
            return;
          }
          const now = new Date().toISOString();
          const optimistic: Project = {
            ...payload,
            owner_id: ownerId,
            id,
            created_at: now,
            updated_at: now,
          };
          set((s) => ({ projects: [optimistic, ...s.projects] }));

          const supabase = createClient();
          const { data, error } = await supabase
            .from("projects")
            .insert({
              id,
              name: payload.name,
              description: payload.description ?? null,
              status: payload.status,
              owner_id: ownerId,
            })
            .select()
            .single();

          if (error || !data) {
            set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
            toast.error("Couldn't create project", {
              description: parseSupabaseError(error),
            });
            return;
          }
          const saved = rowToProject(data);
          set((s) => ({
            projects: s.projects.map((p) => (p.id === id ? saved : p)),
          }));
          toast.success("Project created");
          pushWorkspaceActivity(
            `Created project "${saved.name}"`,
            projectOverviewHref(saved.id),
            saved.id,
          );
        })();

        return id;
      },

      updateProject: (id, partial) => {
        const prev = get().projects.find((p) => p.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const now = new Date().toISOString();
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...partial, updated_at: now } : p,
          ),
        }));

        if (!isSupabaseConfigured) {
          offerUndoToast("Project updated", () =>
            useProjectsStore.setState((s) => ({
              projects: s.projects.map((p) =>
                p.id === id ? structuredClone(snapshot) : p,
              ),
            })),
          );
          const merged = get().projects.find((p) => p.id === id)!;
          pushWorkspaceActivity(
            `Updated project "${merged.name}"`,
            projectOverviewHref(id),
            id,
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          // Only persist the editable columns (owner stays the creator).
          const fields: Database["public"]["Tables"]["projects"]["Update"] = {
            updated_at: now,
          };
          if (partial.name !== undefined) fields.name = partial.name;
          if (partial.description !== undefined)
            fields.description = partial.description ?? null;
          if (partial.status !== undefined) fields.status = partial.status;
          if (partial.risk_buffer_pct !== undefined)
            fields.risk_buffer_pct = partial.risk_buffer_pct;

          const { error } = await supabase
            .from("projects")
            .update(fields)
            .eq("id", id);
          if (error) {
            set((s) => ({
              projects: s.projects.map((p) =>
                p.id === id ? structuredClone(snapshot) : p,
              ),
            }));
            toast.error("Couldn't update project", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success("Project updated");
          const merged = get().projects.find((p) => p.id === id);
          if (merged) {
            pushWorkspaceActivity(
              `Updated project "${merged.name}"`,
              projectOverviewHref(id),
              id,
            );
          }
        })();
      },

      archiveProject: (id) => get().setStatus(id, "archived"),

      deleteProject: (id) => {
        const before = structuredClone(get().projects);
        const proj = get().projects.find((p) => p.id === id);
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));

        if (!isSupabaseConfigured) {
          offerUndoToast("Project deleted", () =>
            useProjectsStore.setState({ projects: before }),
          );
          if (proj) {
            pushWorkspaceActivity(
              `Deleted project "${proj.name}"`,
              projectOverviewHref(id),
              id,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase.from("projects").delete().eq("id", id);
          if (error) {
            set({ projects: before });
            toast.error("Couldn't delete project", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success("Project deleted");
          if (proj) {
            pushWorkspaceActivity(
              `Deleted project "${proj.name}"`,
              projectOverviewHref(id),
              id,
            );
          }
        })();
      },

      setStatus: (id, status) => {
        const prev = get().projects.find((p) => p.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const now = new Date().toISOString();
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, status, updated_at: now } : p,
          ),
        }));

        if (!isSupabaseConfigured) {
          offerUndoToast("Project status updated", () =>
            useProjectsStore.setState((s) => ({
              projects: s.projects.map((p) =>
                p.id === id ? structuredClone(snapshot) : p,
              ),
            })),
          );
          pushWorkspaceActivity(
            `marked project "${prev.name}" as ${PROJECT_STATUS_WORD[status]}`,
            projectOverviewHref(id),
            id,
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("projects")
            .update({ status, updated_at: now })
            .eq("id", id);
          if (error) {
            set((s) => ({
              projects: s.projects.map((p) =>
                p.id === id ? structuredClone(snapshot) : p,
              ),
            }));
            toast.error("Couldn't update status", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success(`Marked ${PROJECT_STATUS_WORD[status].toLowerCase()}`);
          pushWorkspaceActivity(
            `marked project "${prev.name}" as ${PROJECT_STATUS_WORD[status]}`,
            projectOverviewHref(id),
            id,
          );
        })();
      },
    }),
    {
      name: "timeline-projects",
      version: 2,
      // Don't persist live data — it's the source-of-truth in Supabase and is
      // re-fetched on load. Demo mode keeps persisting to localStorage.
      partialize: (s) =>
        isSupabaseConfigured ? { projects: [] } : { projects: s.projects },
      migrate: (persisted) => {
        // persist shallow-merges this into live state, so a partial is fine.
        if (isSupabaseConfigured) {
          return { ...(persisted as object), projects: [] } as unknown as ProjectsState;
        }
        return persisted as ProjectsState;
      },
    },
  ),
);
