"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DUMMY_TASKS } from "@/lib/dummy/tasks.data";
import { roundWorkHours } from "@/lib/utils/work-hours";
import type { Comment, Task, TaskPriority, TaskStatus } from "@/types/task.types";
import { CURRENT_USER_ID } from "@/types/task.types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextTaskId(tasks: Task[]): string {
  let max = 0;
  for (const t of tasks) {
    const m = /^T-(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T-${String(max + 1).padStart(3, "0")}`;
}

type CreateTaskPayload = Omit<Task, "id" | "position" | "created_at" | "updated_at" | "comments">;

interface TasksState {
  tasks: Task[];
  createTask: (payload: CreateTaskPayload) => void;
  updateTask: (id: string, partial: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (taskId: string, toStatus: TaskStatus, toIndex: number) => void;
  reorderTask: (taskId: string, fromIndex: number, toIndex: number, status: TaskStatus) => void;
  addComment: (taskId: string, body: string) => void;
  editComment: (taskId: string, commentId: string, body: string) => void;
  deleteComment: (taskId: string, commentId: string) => void;
  addReply: (taskId: string, commentId: string, body: string, mentionIds: number[]) => void;
  addReaction: (taskId: string, commentId: string, emoji: string, userId: number) => void;
  assignTask: (taskId: string, userId: number | null) => void;
  appendLoggedHours: (taskId: string, hours: number) => void;
  bulkUpdateStatus: (taskIds: string[], status: TaskStatus) => void;
  bulkDelete: (taskIds: string[]) => void;
  bulkMoveToSprint: (taskIds: string[], sprintId: string) => void;
}

export const useTasksDataStore = create<TasksState>()(
  persist(
    (set, get) => ({
      tasks: [...DUMMY_TASKS],

      createTask: (payload) => {
        const now = new Date().toISOString();
        const existing = get().tasks.filter(
          (t) => t.status === payload.status && t.project_id === payload.project_id
        );
        const task: Task = {
          ...payload,
          id: nextTaskId(get().tasks),
          position: existing.length,
          created_at: now,
          updated_at: now,
          comments: [],
        };
        set((s) => ({ tasks: [...s.tasks, task] }));
      },

      updateTask: (id, partial) => {
        const normalized: Partial<Task> = { ...partial };
        if (normalized.logged_hours !== undefined)
          normalized.logged_hours = roundWorkHours(normalized.logged_hours);
        if (normalized.estimated_hours !== undefined)
          normalized.estimated_hours = roundWorkHours(normalized.estimated_hours);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, ...normalized, updated_at: new Date().toISOString() } : t
          ),
        }));
      },

      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveTask: (taskId, toStatus, toIndex) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === taskId);
          if (!task) return s;
          const others = s.tasks.filter((t) => t.id !== taskId);
          const columnTasks = others
            .filter((t) => t.status === toStatus)
            .sort((a, b) => a.position - b.position);
          columnTasks.splice(toIndex, 0, {
            ...task,
            status: toStatus,
            updated_at: new Date().toISOString(),
          });
          const reindexed = columnTasks.map((t, i) => ({ ...t, position: i }));
          const rest = others.filter((t) => t.status !== toStatus);
          return { tasks: [...rest, ...reindexed] };
        }),

      reorderTask: (taskId, _fromIndex, toIndex, status) =>
        set((s) => {
          const columnTasks = s.tasks
            .filter((t) => t.status === status)
            .sort((a, b) => a.position - b.position);
          const idx = columnTasks.findIndex((t) => t.id === taskId);
          if (idx === -1) return s;
          const [moved] = columnTasks.splice(idx, 1);
          columnTasks.splice(toIndex, 0, moved);
          const reindexed = new Map(columnTasks.map((t, i) => [t.id, i]));
          return {
            tasks: s.tasks.map((t) =>
              reindexed.has(t.id) ? { ...t, position: reindexed.get(t.id)! } : t
            ),
          };
        }),

      addComment: (taskId, body) => {
        const comment: Comment = {
          id: uid(),
          author_id: CURRENT_USER_ID,
          body,
          created_at: new Date().toISOString(),
          reactions: [],
          replies: [],
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, comments: [comment, ...t.comments] } : t
          ),
        }));
      },

      editComment: (taskId, commentId, body) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) =>
                    c.id === commentId ? { ...c, body } : c
                  ),
                }
              : t
          ),
        })),

      deleteComment: (taskId, commentId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) }
              : t
          ),
        })),

      addReply: (taskId, commentId, body, mentionIds) => {
        const reply = {
          id: uid(),
          author_id: CURRENT_USER_ID,
          body,
          created_at: new Date().toISOString(),
          mentions: mentionIds,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) =>
                    c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
                  ),
                }
              : t
          ),
        }));
      },

      addReaction: (taskId, commentId, emoji, userId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) => {
                    if (c.id !== commentId) return c;
                    const existing = c.reactions.find((r) => r.emoji === emoji);
                    if (existing) {
                      if (existing.userIds.includes(userId)) {
                        const filtered = existing.userIds.filter((u) => u !== userId);
                        return {
                          ...c,
                          reactions:
                            filtered.length > 0
                              ? c.reactions.map((r) =>
                                  r.emoji === emoji ? { ...r, userIds: filtered } : r
                                )
                              : c.reactions.filter((r) => r.emoji !== emoji),
                        };
                      }
                      return {
                        ...c,
                        reactions: c.reactions.map((r) =>
                          r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r
                        ),
                      };
                    }
                    return {
                      ...c,
                      reactions: [...c.reactions, { emoji, userIds: [userId] }],
                    };
                  }),
                }
              : t
          ),
        })),

      assignTask: (taskId, userId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            if (userId == null) {
              return { ...t, assignee_ids: [], updated_at: new Date().toISOString() };
            }
            const has = t.assignee_ids.includes(userId);
            return {
              ...t,
              assignee_ids: has
                ? t.assignee_ids.filter((x) => x !== userId)
                : [...t.assignee_ids, userId],
              updated_at: new Date().toISOString(),
            };
          }),
        })),

      appendLoggedHours: (taskId, hours) => {
        if (hours <= 0) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  logged_hours: roundWorkHours((t.logged_hours ?? 0) + hours),
                  updated_at: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      bulkUpdateStatus: (taskIds, status) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id) ? { ...t, status, updated_at: new Date().toISOString() } : t
          ),
        })),

      bulkDelete: (taskIds) =>
        set((s) => ({ tasks: s.tasks.filter((t) => !taskIds.includes(t.id)) })),

      bulkMoveToSprint: (taskIds, sprintId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id)
              ? { ...t, sprint_id: sprintId, updated_at: new Date().toISOString() }
              : t
          ),
        })),
    }),
    {
      name: "timeline-tasks",
      version: 1,
    }
  )
);
