"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  notifyAssigneesUpdated,
  notifyCommentAdded,
  notifyCommentEdited,
  notifyCommentRemoved,
  notifyReplyAdded,
} from "@/lib/collaboration/notify-task-activity";
import { pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { projectOverviewHref, sprintTasksHref } from "@/lib/constants/sprints";
import { DUMMY_TASKS } from "@/lib/dummy/tasks.data";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import { taskBoardRelativePath } from "@/lib/utils/share-links";
import { roundWorkHours } from "@/lib/utils/work-hours";
import type {
  Comment,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/task.types";
import { CURRENT_USER_ID, TASK_STATUSES } from "@/types/task.types";

function columnLabel(status: TaskStatus): string {
  return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
}

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

type CreateTaskPayload = Omit<
  Task,
  "id" | "position" | "created_at" | "updated_at" | "comments"
>;

interface TasksState {
  tasks: Task[];
  createTask: (payload: CreateTaskPayload) => void;
  updateTask: (id: string, partial: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (taskId: string, toStatus: TaskStatus, toIndex: number) => void;
  reorderTask: (
    taskId: string,
    fromIndex: number,
    toIndex: number,
    status: TaskStatus,
  ) => void;
  addComment: (taskId: string, body: string) => void;
  editComment: (taskId: string, commentId: string, body: string) => void;
  deleteComment: (taskId: string, commentId: string) => void;
  addReply: (
    taskId: string,
    commentId: string,
    body: string,
    mentionIds: number[],
  ) => void;
  addReaction: (
    taskId: string,
    commentId: string,
    emoji: string,
    userId: number,
  ) => void;
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
        const beforeTasks = structuredClone(get().tasks);
        const now = new Date().toISOString();
        const existing = get().tasks.filter(
          (t) =>
            t.status === payload.status && t.project_id === payload.project_id,
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
        offerUndoToast("Task created", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
          task.title.trim() || undefined,
        );
        const titleUi = task.title.trim() || "Untitled task";
        pushWorkspaceActivity(
          `Created task "${titleUi}"`,
          taskBoardRelativePath(task),
          task.project_id,
        );
      },

      updateTask: (id, partial) => {
        const prev = get().tasks.find((t) => t.id === id);
        if (!prev) return;
        const snapshot = structuredClone(prev);
        const normalized: Partial<Task> = { ...partial };
        if (normalized.logged_hours !== undefined)
          normalized.logged_hours = roundWorkHours(normalized.logged_hours);
        if (normalized.estimated_hours !== undefined)
          normalized.estimated_hours = roundWorkHours(
            normalized.estimated_hours,
          );
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? { ...t, ...normalized, updated_at: new Date().toISOString() }
              : t,
          ),
        }));
        offerUndoToast("Task updated", () =>
          useTasksDataStore.setState((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === id ? structuredClone(snapshot) : t,
            ),
          })),
        );
        const merged = get().tasks.find((t) => t.id === id)!;
        const titleUi = merged.title.trim() || "Untitled task";
        pushWorkspaceActivity(
          `Updated task "${titleUi}"`,
          taskBoardRelativePath(merged),
          merged.project_id,
        );
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        const beforeTasks = structuredClone(get().tasks);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        offerUndoToast("Task deleted", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        if (task) {
          const titleUi = task.title.trim() || "Untitled task";
          pushWorkspaceActivity(
            `Deleted task "${titleUi}"`,
            taskBoardRelativePath(task),
            task.project_id,
          );
        }
      },

      moveTask: (taskId, toStatus, toIndex) => {
        const snap = get();
        const task = snap.tasks.find((t) => t.id === taskId);
        if (!task) return;
        const beforeTasks = structuredClone(snap.tasks);
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
        });
        offerUndoToast("Task moved", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        const moved = get().tasks.find((t) => t.id === taskId);
        if (moved) {
          const titleUi = moved.title.trim() || "Untitled task";
          pushWorkspaceActivity(
            `"${titleUi}" moved to ${columnLabel(moved.status)}`,
            taskBoardRelativePath(moved),
            moved.project_id,
          );
        }
      },

      reorderTask: (taskId, _fromIndex, toIndex, status) => {
        const snap = get();
        const sorted = snap.tasks
          .filter((t) => t.status === status)
          .sort((a, b) => a.position - b.position);
        const idxEarly = sorted.findIndex((t) => t.id === taskId);
        if (idxEarly === -1) return;
        const beforeTasks = structuredClone(snap.tasks);
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
              reindexed.has(t.id)
                ? { ...t, position: reindexed.get(t.id)! }
                : t,
            ),
          };
        });
        offerUndoToast("Task reordered", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
      },

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
            t.id === taskId ? { ...t, comments: [comment, ...t.comments] } : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyCommentAdded(task);
      },

      editComment: (taskId, commentId, body) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) =>
                    c.id === commentId ? { ...c, body } : c,
                  ),
                }
              : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyCommentEdited(task);
      },

      deleteComment: (taskId, commentId) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, comments: t.comments.filter((c) => c.id !== commentId) }
              : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyCommentRemoved(task);
      },

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
                    c.id === commentId
                      ? { ...c, replies: [...c.replies, reply] }
                      : c,
                  ),
                }
              : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyReplyAdded(task, mentionIds.length);
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
                        const filtered = existing.userIds.filter(
                          (u) => u !== userId,
                        );
                        return {
                          ...c,
                          reactions:
                            filtered.length > 0
                              ? c.reactions.map((r) =>
                                  r.emoji === emoji
                                    ? { ...r, userIds: filtered }
                                    : r,
                                )
                              : c.reactions.filter((r) => r.emoji !== emoji),
                        };
                      }
                      return {
                        ...c,
                        reactions: c.reactions.map((r) =>
                          r.emoji === emoji
                            ? { ...r, userIds: [...r.userIds, userId] }
                            : r,
                        ),
                      };
                    }
                    return {
                      ...c,
                      reactions: [...c.reactions, { emoji, userIds: [userId] }],
                    };
                  }),
                }
              : t,
          ),
        })),

      assignTask: (taskId, userId) => {
        const beforeTasks = structuredClone(get().tasks);
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            if (userId == null) {
              return {
                ...t,
                assignee_ids: [],
                updated_at: new Date().toISOString(),
              };
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
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyAssigneesUpdated(task);
        offerUndoToast("Assignees updated", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
      },

      appendLoggedHours: (taskId, hours) => {
        if (hours <= 0) return;
        const beforeTasks = structuredClone(get().tasks);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  logged_hours: roundWorkHours((t.logged_hours ?? 0) + hours),
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
        offerUndoToast("Logged time updated", () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) {
          const titleUi = task.title.trim() || "Untitled task";
          pushWorkspaceActivity(
            `Logged time on "${titleUi}"`,
            taskBoardRelativePath(task),
            task.project_id,
          );
        }
      },

      bulkUpdateStatus: (taskIds, status) => {
        if (!taskIds.length) return;
        const beforeTasks = structuredClone(get().tasks);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id)
              ? { ...t, status, updated_at: new Date().toISOString() }
              : t,
          ),
        }));
        const n = taskIds.length;
        const toastMsg =
          n === 1 ? "Task status updated" : `${n} tasks updated`;
        offerUndoToast(toastMsg, () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        const primary = taskIds
          .map((tid) =>
            beforeTasks.find((t) => t.id === tid),
          )
          .find(Boolean);
        if (primary) {
          pushWorkspaceActivity(
            toastMsg,
            taskBoardRelativePath({ ...primary, status }),
            primary.project_id,
          );
        }
      },

      bulkDelete: (taskIds) => {
        if (!taskIds.length) return;
        const beforeTasks = structuredClone(get().tasks);
        const n = taskIds.length;
        const anchor = taskIds
          .map((id) => beforeTasks.find((t) => t.id === id))
          .find(Boolean);
        set((s) => ({
          tasks: s.tasks.filter((t) => !taskIds.includes(t.id)),
        }));
        const toastMsg = n === 1 ? "Task deleted" : `${n} tasks deleted`;
        offerUndoToast(toastMsg, () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        if (anchor) {
          pushWorkspaceActivity(
            toastMsg,
            projectOverviewHref(anchor.project_id),
            anchor.project_id,
          );
        }
      },

      bulkMoveToSprint: (taskIds, sprintId) => {
        if (!taskIds.length) return;
        const beforeTasks = structuredClone(get().tasks);
        const anchor = taskIds
          .map((id) => beforeTasks.find((t) => t.id === id))
          .find(Boolean);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id)
              ? {
                  ...t,
                  sprint_id: sprintId,
                  updated_at: new Date().toISOString(),
                }
              : t,
          ),
        }));
        const n = taskIds.length;
        const toastMsg =
          n === 1 ? "Task moved to sprint" : `${n} tasks moved to sprint`;
        offerUndoToast(toastMsg, () =>
          useTasksDataStore.setState({ tasks: beforeTasks }),
        );
        if (anchor) {
          pushWorkspaceActivity(
            toastMsg,
            sprintTasksHref(anchor.project_id, sprintId),
            anchor.project_id,
          );
        }
      },
    }),
    {
      name: "timeline-tasks",
      version: 1,
    },
  ),
);
