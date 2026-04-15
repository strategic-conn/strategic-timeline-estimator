"use client";

import { create } from "zustand";

import { useTasksDataStore } from "@/store/tasks-store";

type TasksView = "kanban" | "list" | "table";

interface TasksUIState {
  selectedTaskId: string | null;
  activeView: TasksView;
  setSelectedTaskId: (id: string | null) => void;
  setActiveView: (view: TasksView) => void;
}

export const useTasksStore = create<TasksUIState>((set) => ({
  selectedTaskId: null,
  activeView: "kanban",
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setActiveView: (view) => set({ activeView: view }),
}));

export interface TaskTimerSlice {
  accumulatedMs: number;
  runningSince: number | null;
}

export const useTaskTimerStore = create<{
  timers: Record<string, TaskTimerSlice>;
  play: (taskId: string) => void;
  pause: (taskId: string) => void;
  clearTimer: (taskId: string) => void;
  consumeElapsedHours: (taskId: string) => number;
}>((set, get) => ({
  timers: {},
  play: (taskId) => {
    set((s) => {
      const cur = s.timers[taskId] ?? { accumulatedMs: 0, runningSince: null };
      if (cur.runningSince != null) return s;
      return {
        timers: { ...s.timers, [taskId]: { ...cur, runningSince: Date.now() } },
      };
    });
  },
  pause: (taskId) => {
    set((s) => {
      const cur = s.timers[taskId];
      if (!cur || cur.runningSince == null) return s;
      return {
        timers: {
          ...s.timers,
          [taskId]: {
            accumulatedMs: cur.accumulatedMs + (Date.now() - cur.runningSince),
            runningSince: null,
          },
        },
      };
    });
  },
  clearTimer: (taskId) => {
    set((s) => {
      if (!(taskId in s.timers)) return s;
      const { [taskId]: _, ...rest } = s.timers;
      return { timers: rest };
    });
  },
  consumeElapsedHours: (taskId) => {
    const cur = get().timers[taskId];
    if (!cur) return 0;
    let ms = cur.accumulatedMs;
    if (cur.runningSince != null) ms += Date.now() - cur.runningSince;
    get().clearTimer(taskId);
    return ms / (1000 * 60 * 60);
  },
}));

/**
 * Convenience hook that returns all task data & mutations from the shared Zustand store.
 * Drop-in replacement for the old `useState`-based hook — same return shape.
 */
export function useTasks() {
  const store = useTasksDataStore();
  return {
    tasks: store.tasks,
    createTask: store.createTask,
    updateTask: store.updateTask,
    deleteTask: store.deleteTask,
    moveTask: store.moveTask,
    reorderTask: store.reorderTask,
    addComment: store.addComment,
    editComment: store.editComment,
    deleteComment: store.deleteComment,
    addReply: store.addReply,
    addReaction: store.addReaction,
    assignTask: store.assignTask,
    appendLoggedHours: store.appendLoggedHours,
    bulkUpdateStatus: store.bulkUpdateStatus,
    bulkDelete: store.bulkDelete,
    bulkMoveToSprint: store.bulkMoveToSprint,
  };
}
