"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { toast } from "sonner";

import { createEmptyDiscoveryProject } from "@/lib/discovery/constants";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { useAuthStore } from "@/store/auth-store";
import type { Database, Json } from "@/types/database.types";
import type {
  DiscoveryProject,
  PhaseStatus,
  TrackerState,
} from "@/types/discovery.types";

type DiscoverySeed = Partial<
  Omit<DiscoveryProject, "id" | "created_at" | "updated_at">
>;

type DiscoveryRow = Database["public"]["Tables"]["discovery_projects"]["Row"];

function nextId(projects: DiscoveryProject[]): string {
  let max = 0;
  for (const p of projects) {
    const m = /^disc-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `disc-${max + 1}`;
}

function emptyTracker(): TrackerState {
  return { checkedTasks: {}, phaseStatus: {}, hoursLogged: {}, phaseNotes: {} };
}

/** Reconstruct a DiscoveryProject from a row (scalar cols + JSONB `data`). */
function rowToProject(r: DiscoveryRow): DiscoveryProject {
  return {
    ...(r.data as unknown as Omit<
      DiscoveryProject,
      "id" | "created_at" | "updated_at"
    >),
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** The project's editable fields as the JSONB `data` payload (no id/timestamps). */
function toDataJson(p: DiscoveryProject): Json {
  const { id: _id, created_at: _c, updated_at: _u, ...data } = p;
  void _id;
  void _c;
  void _u;
  return data as unknown as Json;
}

/**
 * Best-effort persist of a discovery doc (data + tracker) after an optimistic
 * edit (live mode). Wizard fields and tracker toggles fire frequently, so we
 * don't roll back per keystroke — a failed save surfaces as a toast.
 */
function persistDiscoveryDoc(
  id: string,
  get: () => DiscoveryState,
): void {
  if (!isSupabaseConfigured) return;
  const project = get().projects.find((p) => p.id === id);
  if (!project) return;
  const tracker = get().tracker[id] ?? emptyTracker();
  void (async () => {
    const supabase = createClient();
    const { error } = await supabase
      .from("discovery_projects")
      .update({
        data: toDataJson(project),
        tracker: tracker as unknown as Json,
        updated_at: project.updated_at,
      })
      .eq("id", id);
    if (error) {
      toast.error("Couldn't save discovery changes", {
        description: parseSupabaseError(error),
      });
    }
  })();
}

const discoveryStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
});

interface DiscoveryState {
  projects: DiscoveryProject[];
  tracker: Record<string, TrackerState>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Pull discovery projects from Supabase (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  createProject: (seed?: DiscoverySeed) => string;
  updateProject: (id: string, partial: Partial<DiscoveryProject>) => void;
  deleteProject: (id: string) => void;
  toggleTask: (projectId: string, taskId: string) => void;
  setPhaseStatus: (projectId: string, phaseId: string, status: PhaseStatus) => void;
  setHoursLogged: (projectId: string, phaseId: string, hours: number) => void;
  setPhaseNotes: (projectId: string, phaseId: string, notes: string) => void;
}

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      projects: [],
      tracker: {},
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        // RLS scopes to admin/manager; others get an empty set.
        const { data, error } = await supabase
          .from("discovery_projects")
          .select("*")
          .order("updated_at", { ascending: false });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        const projects: DiscoveryProject[] = [];
        const tracker: Record<string, TrackerState> = {};
        for (const row of data ?? []) {
          projects.push(rowToProject(row));
          tracker[row.id] = {
            ...emptyTracker(),
            ...(row.tracker as unknown as Partial<TrackerState>),
          };
        }
        set({ projects, tracker, loading: false, loaded: true, error: null });
      },

      createProject: (seed) => {
        const now = new Date().toISOString();
        const id = isSupabaseConfigured
          ? crypto.randomUUID()
          : nextId(get().projects);
        const project: DiscoveryProject = {
          ...createEmptyDiscoveryProject(),
          ...seed,
          id,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({
          projects: [project, ...s.projects],
          tracker: { ...s.tracker, [id]: emptyTracker() },
        }));

        if (isSupabaseConfigured) {
          const ownerId = useAuthStore.getState().user.authId;
          if (!ownerId) {
            set((s) => {
              const tracker = { ...s.tracker };
              delete tracker[id];
              return { projects: s.projects.filter((p) => p.id !== id), tracker };
            });
            toast.error("Couldn't create discovery project", {
              description: "You need to be signed in.",
            });
            return id;
          }
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase.from("discovery_projects").insert({
              id,
              owner_id: ownerId,
              data: toDataJson(project),
              tracker: emptyTracker() as unknown as Json,
            });
            if (error) {
              set((s) => {
                const tracker = { ...s.tracker };
                delete tracker[id];
                return {
                  projects: s.projects.filter((p) => p.id !== id),
                  tracker,
                };
              });
              toast.error("Couldn't create discovery project", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }

        return id;
      },

      updateProject: (id, partial) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, ...partial, updated_at: new Date().toISOString() }
              : p,
          ),
        }));
        persistDiscoveryDoc(id, get);
      },

      deleteProject: (id) => {
        const beforeProjects = structuredClone(get().projects);
        const beforeTracker = structuredClone(get().tracker);
        set((s) => {
          const tracker = { ...s.tracker };
          delete tracker[id];
          return { projects: s.projects.filter((p) => p.id !== id), tracker };
        });

        if (isSupabaseConfigured) {
          void (async () => {
            const supabase = createClient();
            const { error } = await supabase
              .from("discovery_projects")
              .delete()
              .eq("id", id);
            if (error) {
              set({ projects: beforeProjects, tracker: beforeTracker });
              toast.error("Couldn't delete discovery project", {
                description: parseSupabaseError(error),
              });
            }
          })();
        }
      },

      toggleTask: (projectId, taskId) => {
        set((s) => {
          const t = s.tracker[projectId] ?? emptyTracker();
          return {
            tracker: {
              ...s.tracker,
              [projectId]: {
                ...t,
                checkedTasks: {
                  ...t.checkedTasks,
                  [taskId]: !t.checkedTasks[taskId],
                },
              },
            },
          };
        });
        persistDiscoveryDoc(projectId, get);
      },

      setPhaseStatus: (projectId, phaseId, status) => {
        set((s) => {
          const t = s.tracker[projectId] ?? emptyTracker();
          return {
            tracker: {
              ...s.tracker,
              [projectId]: {
                ...t,
                phaseStatus: { ...t.phaseStatus, [phaseId]: status },
              },
            },
          };
        });
        persistDiscoveryDoc(projectId, get);
      },

      setHoursLogged: (projectId, phaseId, hours) => {
        set((s) => {
          const t = s.tracker[projectId] ?? emptyTracker();
          return {
            tracker: {
              ...s.tracker,
              [projectId]: {
                ...t,
                hoursLogged: { ...t.hoursLogged, [phaseId]: hours },
              },
            },
          };
        });
        persistDiscoveryDoc(projectId, get);
      },

      setPhaseNotes: (projectId, phaseId, notes) => {
        set((s) => {
          const t = s.tracker[projectId] ?? emptyTracker();
          return {
            tracker: {
              ...s.tracker,
              [projectId]: {
                ...t,
                phaseNotes: { ...t.phaseNotes, [phaseId]: notes },
              },
            },
          };
        });
        persistDiscoveryDoc(projectId, get);
      },
    }),
    {
      name: "timeline-discovery",
      version: 2,
      storage: discoveryStorage,
      // Live data is the source-of-truth in Supabase; don't persist it locally.
      partialize: (s) =>
        isSupabaseConfigured
          ? { projects: [], tracker: {} }
          : { projects: s.projects, tracker: s.tracker },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            projects: [],
            tracker: {},
          } as unknown as DiscoveryState;
        }
        return persisted as DiscoveryState;
      },
    },
  ),
);

export { emptyTracker };
