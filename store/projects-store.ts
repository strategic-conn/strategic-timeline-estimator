"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { projectOverviewHref } from "@/lib/constants/sprints";
import { DUMMY_PROJECTS } from "@/lib/dummy/projects.data";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import type { Project, ProjectStatus } from "@/types/project.types";

const PROJECT_STATUS_WORD: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

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
  createProject: (payload: CreateProjectInput) => void;
  updateProject: (id: string, partial: Partial<Project>) => void;
  archiveProject: (id: string) => void;
  deleteProject: (id: string) => void;
  setStatus: (id: string, status: ProjectStatus) => void;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [...DUMMY_PROJECTS],
      createProject: (payload) => {
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
        offerUndoToast("Project created", () =>
          useProjectsStore.setState({ projects: before }),
          next.name,
        );
        pushWorkspaceActivity(
          `Created project "${next.name}"`,
          projectOverviewHref(id),
          id,
        );
      },
      updateProject: (id, partial) => {
        const prev = get().projects.find((p) => p.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, ...partial, updated_at: new Date().toISOString() }
              : p,
          ),
        }));
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
      },
      archiveProject: (id) => {
        const before = structuredClone(get().projects);
        const proj = get().projects.find((p) => p.id === id);
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: "archived",
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
        offerUndoToast("Project archived", () =>
          useProjectsStore.setState({ projects: before }),
        );
        if (proj) {
          pushWorkspaceActivity(
            `Archived "${proj.name}"`,
            projectOverviewHref(id),
            id,
          );
        }
      },
      deleteProject: (id) => {
        const before = structuredClone(get().projects);
        const proj = get().projects.find((p) => p.id === id);
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
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
      },
      setStatus: (id, status) => {
        const prev = get().projects.find((p) => p.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, status, updated_at: new Date().toISOString() }
              : p,
          ),
        }));
        offerUndoToast("Project status updated", () =>
          useProjectsStore.setState((s) => ({
            projects: s.projects.map((p) =>
              p.id === id ? structuredClone(snapshot) : p,
            ),
          })),
        );
        pushWorkspaceActivity(
          `Project "${prev.name}" marked ${PROJECT_STATUS_WORD[status]}`,
          projectOverviewHref(id),
          id,
        );
      },
    }),
    {
      name: "timeline-projects",
      version: 1,
    },
  ),
);
