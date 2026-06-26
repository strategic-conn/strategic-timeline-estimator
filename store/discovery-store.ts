"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createEmptyDiscoveryProject } from "@/lib/discovery/constants";
import type {
  DiscoveryProject,
  PhaseStatus,
  TrackerState,
} from "@/types/discovery.types";

type DiscoverySeed = Partial<
  Omit<DiscoveryProject, "id" | "created_at" | "updated_at">
>;

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

const discoveryStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  return window.localStorage;
});

interface DiscoveryState {
  projects: DiscoveryProject[];
  tracker: Record<string, TrackerState>;
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

      createProject: (seed) => {
        const id = nextId(get().projects);
        const now = new Date().toISOString();
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
        return id;
      },

      updateProject: (id, partial) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, ...partial, updated_at: new Date().toISOString() }
              : p,
          ),
        })),

      deleteProject: (id) =>
        set((s) => {
          const tracker = { ...s.tracker };
          delete tracker[id];
          return { projects: s.projects.filter((p) => p.id !== id), tracker };
        }),

      toggleTask: (projectId, taskId) =>
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
        }),

      setPhaseStatus: (projectId, phaseId, status) =>
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
        }),

      setHoursLogged: (projectId, phaseId, hours) =>
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
        }),

      setPhaseNotes: (projectId, phaseId, notes) =>
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
        }),
    }),
    {
      name: "timeline-discovery",
      version: 1,
      storage: discoveryStorage,
    },
  ),
);

export { emptyTracker };
