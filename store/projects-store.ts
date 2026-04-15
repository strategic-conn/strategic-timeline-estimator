"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DUMMY_PROJECTS } from "@/lib/dummy/projects.data";
import type { Project, ProjectStatus } from "@/types/project.types";

function nextProjectId(projects: Project[]): string {
  let max = 0;
  for (const p of projects) {
    const m = /^proj-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `proj-${max + 1}`;
}

export type CreateProjectInput = Omit<Project, "id" | "created_at" | "updated_at">;

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
        const id = nextProjectId(get().projects);
        const now = new Date().toISOString();
        const next: Project = { ...payload, id, created_at: now, updated_at: now };
        set((s) => ({ projects: [next, ...s.projects] }));
      },
      updateProject: (id, partial) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, ...partial, updated_at: new Date().toISOString() }
              : p
          ),
        })),
      archiveProject: (id) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, status: "archived", updated_at: new Date().toISOString() }
              : p
          ),
        })),
      deleteProject: (id) =>
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
      setStatus: (id, status) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p
          ),
        })),
    }),
    {
      name: "timeline-projects",
      version: 1,
    }
  )
);
