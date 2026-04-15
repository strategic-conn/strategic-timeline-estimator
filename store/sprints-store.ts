"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DUMMY_SPRINTS } from "@/lib/dummy/sprints.data";
import type { Sprint, SprintStatus } from "@/types/sprint.types";

function nextSprintId(sprints: Sprint[]): string {
  let max = 0;
  for (const s of sprints) {
    const m = /^sprint-(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `sprint-${max + 1}`;
}

export type CreateSprintInput = Omit<Sprint, "id" | "position" | "created_at" | "updated_at">;

interface SprintsState {
  sprints: Sprint[];
  createSprint: (payload: CreateSprintInput) => void;
  updateSprint: (id: string, partial: Partial<Sprint>) => void;
  deleteSprint: (id: string) => void;
  setSprintStatus: (id: string, status: SprintStatus) => void;
}

export const useSprintsStore = create<SprintsState>()(
  persist(
    (set, get) => ({
      sprints: [...DUMMY_SPRINTS],

      createSprint: (payload) => {
        const id = nextSprintId(get().sprints);
        const siblings = get().sprints.filter((s) => s.project_id === payload.project_id);
        const now = new Date().toISOString();
        const next: Sprint = {
          ...payload,
          id,
          position: siblings.length,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ sprints: [...s.sprints, next] }));
      },

      updateSprint: (id, partial) =>
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id
              ? { ...sp, ...partial, updated_at: new Date().toISOString() }
              : sp
          ),
        })),

      deleteSprint: (id) =>
        set((s) => ({ sprints: s.sprints.filter((sp) => sp.id !== id) })),

      setSprintStatus: (id, status) =>
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id
              ? { ...sp, status, updated_at: new Date().toISOString() }
              : sp
          ),
        })),
    }),
    {
      name: "timeline-sprints",
      version: 1,
    }
  )
);
