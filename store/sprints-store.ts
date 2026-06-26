"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import { DUMMY_SPRINTS } from "@/lib/dummy/sprints.data";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import { SPRINT_STATUSES, type Sprint, type SprintStatus } from "@/types/sprint.types";

function sprintStatusLabel(status: SprintStatus): string {
  return SPRINT_STATUSES.find((s) => s.value === status)?.label ?? status;
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
        const before = structuredClone(get().sprints);
        const id = nextSprintId(get().sprints);
        const siblings = get().sprints.filter(
          (s) => s.project_id === payload.project_id,
        );
        const now = new Date().toISOString();
        const next: Sprint = {
          ...payload,
          id,
          position: siblings.length,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ sprints: [...s.sprints, next] }));
        offerUndoToast("Sprint created", () =>
          useSprintsStore.setState({ sprints: before }),
          next.name,
        );
        pushWorkspaceActivity(
          `Created sprint "${next.name}"`,
          sprintTasksHref(next.project_id, id),
          next.project_id,
        );
      },

      updateSprint: (id, partial) => {
        const prev = get().sprints.find((sp) => sp.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id
              ? { ...sp, ...partial, updated_at: new Date().toISOString() }
              : sp,
          ),
        }));
        offerUndoToast("Sprint updated", () =>
          useSprintsStore.setState((s) => ({
            sprints: s.sprints.map((sp) =>
              sp.id === id ? structuredClone(snapshot) : sp,
            ),
          })),
        );
        const merged = get().sprints.find((sp) => sp.id === id)!;
        pushWorkspaceActivity(
          `Updated sprint "${merged.name}"`,
          sprintTasksHref(merged.project_id, id),
          merged.project_id,
        );
      },

      deleteSprint: (id) => {
        const before = structuredClone(get().sprints);
        const prev = get().sprints.find((sp) => sp.id === id);
        set((s) => ({ sprints: s.sprints.filter((sp) => sp.id !== id) }));
        offerUndoToast("Sprint deleted", () =>
          useSprintsStore.setState({ sprints: before }),
        );
        if (prev) {
          pushWorkspaceActivity(
            `Deleted sprint "${prev.name}"`,
            backlogHref(prev.project_id),
            prev.project_id,
          );
        }
      },

      setSprintStatus: (id, status) => {
        const prev = get().sprints.find((sp) => sp.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        set((s) => ({
          sprints: s.sprints.map((sp) =>
            sp.id === id
              ? { ...sp, status, updated_at: new Date().toISOString() }
              : sp,
          ),
        }));
        offerUndoToast("Sprint status updated", () =>
          useSprintsStore.setState((s) => ({
            sprints: s.sprints.map((sp) =>
              sp.id === id ? structuredClone(snapshot) : sp,
            ),
          })),
        );
        const msg =
          status === "active"
            ? `"${prev.name}" started`
            : status === "completed"
              ? `"${prev.name}" completed`
              : `"${prev.name}" set to ${sprintStatusLabel(status)}`;
        pushWorkspaceActivity(
          msg,
          sprintTasksHref(prev.project_id, id),
          prev.project_id,
        );
      },
    }),
    {
      name: "timeline-sprints",
      version: 1,
    },
  ),
);
