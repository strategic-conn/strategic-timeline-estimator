"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";

import {
  notifyAssigneesUpdated,
  notifyCommentAdded,
  notifyCommentEdited,
  notifyCommentRemoved,
  notifyReplyAdded,
} from "@/lib/collaboration/notify-task-activity";
import { pushWorkspaceActivity, notifyUsers } from "@/lib/activity/workspace-push";
import { withProjectScope } from "@/lib/activity/project-label";
import { commentRecipients, taskRecipients } from "@/lib/activity/recipients";
import { projectOverviewHref, sprintTasksHref } from "@/lib/constants/sprints";
import { DUMMY_TASKS } from "@/lib/dummy/tasks.data";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseSupabaseError } from "@/lib/supabase/parse-error";
import { mirrorTaskChange } from "@/lib/sync/estimate-project-sync";
import { offerUndoToast } from "@/lib/undo/offer-undo-toast";
import { taskBoardRelativePath } from "@/lib/utils/share-links";
import { roundWorkHours } from "@/lib/utils/work-hours";
import { useAuthStore } from "@/store/auth-store";
import type { Database } from "@/types/database.types";
import type {
  AssignmentStatus,
  Comment,
  Reaction,
  Reply,
  Task,
  TaskAssignment,
  TaskStatus,
} from "@/types/task.types";
import { CURRENT_USER_ID, TASK_STATUSES } from "@/types/task.types";

/** Author for a new comment/reply: real signed-in user in live mode, demo id otherwise. */
function currentAuthorId(): string {
  return useAuthStore.getState().user.authId ?? CURRENT_USER_ID;
}

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

function titleOf(task: Task): string {
  return task.title.trim() || "Untitled task";
}

/** Display name of the person performing the current action. */
function actorName(): string {
  return useAuthStore.getState().user.name?.trim() || "Someone";
}

/** Single-line, length-capped preview of a comment/reply body for notifications. */
function bodyPreview(body: string, max = 60): string {
  const s = body.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Send a targeted notification about a task (actor auto-excluded by the store). */
function notifyAboutTask(
  recipientIds: string[],
  text: string,
  task: Task,
): void {
  notifyUsers(
    recipientIds,
    withProjectScope(text, task.project_id),
    taskBoardRelativePath(task),
    task.project_id,
  );
}

type SupabaseBrowserClient = ReturnType<typeof createClient>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type AssigneeRow = {
  profile_id: string;
  status: AssignmentStatus;
  assigned_by: string | null;
  responded_at: string | null;
  note: string | null;
};
type TaskRowWithAssignees = TaskRow & {
  task_assignees: AssigneeRow[];
};

function rowToAssignment(a: AssigneeRow): TaskAssignment {
  return {
    profile_id: a.profile_id,
    status: (a.status as AssignmentStatus) ?? "accepted",
    assigned_by: a.assigned_by ?? null,
    responded_at: a.responded_at ?? null,
    note: a.note ?? null,
  };
}

function rowToTask(r: TaskRowWithAssignees): Task {
  const assignees = (r.task_assignees ?? []).map(rowToAssignment);
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    status: r.status,
    priority: r.priority,
    assignees,
    assignee_ids: assignees.map((a) => a.profile_id),
    reporter_id: r.reporter_id,
    project_id: r.project_id,
    sprint_id: r.sprint_id,
    due_date: r.due_date ?? undefined,
    estimated_hours: r.estimated_hours ?? undefined,
    logged_hours: r.logged_hours ?? undefined,
    tags: r.tags,
    source_line_item_id: r.source_line_item_id ?? null,
    position: r.position,
    created_at: r.created_at,
    updated_at: r.updated_at,
    // `?? null`: the column arrives with 0047; before that the row lacks it.
    completed_at: r.completed_at ?? null,
    comments: [],
  };
}

/** New assignments are pending unless you assign yourself (auto-accepted). */
function newAssignment(
  profileId: string,
  assignerId: string | null,
): TaskAssignment {
  const self = assignerId != null && profileId === assignerId;
  return {
    profile_id: profileId,
    status: self ? "accepted" : "pending",
    assigned_by: assignerId,
    responded_at: self ? new Date().toISOString() : null,
    note: null,
  };
}

/** Merge a new assignee id-list onto existing assignments, preserving statuses. */
function mergeAssigneesForIds(
  existing: TaskAssignment[],
  newIds: string[],
  assignerId: string | null,
): TaskAssignment[] {
  const byId = new Map(existing.map((a) => [a.profile_id, a]));
  return newIds.map((id) => byId.get(id) ?? newAssignment(id, assignerId));
}

/** Persist an assignee change as a diff (keeps existing rows/statuses intact). */
async function syncAssigneeDiff(
  supabase: SupabaseBrowserClient,
  taskId: string,
  existing: TaskAssignment[],
  newIds: string[],
  assignerId: string | null,
): Promise<{ error: { message?: string } | null }> {
  const existingIds = new Set(existing.map((a) => a.profile_id));
  const nextIds = new Set(newIds);
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
  const toAdd = newIds.filter((id) => !existingIds.has(id));

  if (toRemove.length) {
    const del = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("profile_id", toRemove);
    if (del.error) return { error: del.error };
  }
  if (toAdd.length) {
    const ins = await supabase.from("task_assignees").insert(
      toAdd.map((profile_id) => {
        const a = newAssignment(profile_id, assignerId);
        return {
          task_id: taskId,
          profile_id,
          status: a.status,
          assigned_by: a.assigned_by,
          responded_at: a.responded_at,
        };
      }),
    );
    if (ins.error) return { error: ins.error };
  }
  return { error: null };
}

/** Profile ids added by moving from `before` to `after` (for notifying new assignees). */
function addedAssigneeIds(before: string[], after: string[]): string[] {
  const b = new Set(before);
  return after.filter((id) => !b.has(id));
}

type CommentRow = Database["public"]["Tables"]["task_comments"]["Row"];
type CommentRowWithReactions = CommentRow & {
  comment_reactions: { profile_id: string; emoji: string }[];
};

/** Collapse per-(profile,emoji) reaction rows into the UI's emoji→userIds shape. */
function groupReactions(
  rows: { profile_id: string; emoji: string }[],
): Reaction[] {
  const byEmoji = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byEmoji.get(r.emoji) ?? [];
    arr.push(r.profile_id);
    byEmoji.set(r.emoji, arr);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
}

/** Toggle a user's emoji reaction within a list (add / remove, dropping empties). */
function toggleReactionList(
  reactions: Reaction[],
  emoji: string,
  userId: string,
): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, userIds: [userId] }];
  if (existing.userIds.includes(userId)) {
    const filtered = existing.userIds.filter((u) => u !== userId);
    return filtered.length > 0
      ? reactions.map((r) =>
          r.emoji === emoji ? { ...r, userIds: filtered } : r,
        )
      : reactions.filter((r) => r.emoji !== emoji);
  }
  return reactions.map((r) =>
    r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r,
  );
}

/**
 * Idempotently set a user's emoji reaction to present/absent within a list.
 * Unlike `toggleReactionList`, applying the same realtime event twice is safe
 * (our own optimistic write echoes back), so this never flips an existing state.
 */
function ensureReaction(
  reactions: Reaction[],
  emoji: string,
  userId: string,
  present: boolean,
): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  const has = existing?.userIds.includes(userId) ?? false;
  if (present) {
    if (has) return reactions;
    if (!existing) return [...reactions, { emoji, userIds: [userId] }];
    return reactions.map((r) =>
      r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r,
    );
  }
  if (!has) return reactions;
  const filtered = existing!.userIds.filter((u) => u !== userId);
  return filtered.length > 0
    ? reactions.map((r) => (r.emoji === emoji ? { ...r, userIds: filtered } : r))
    : reactions.filter((r) => r.emoji !== emoji);
}

/**
 * Build the nested `Comment[]` (top-level newest-first, replies oldest-first)
 * per task id from flat task_comments rows + embedded reactions.
 */
function assembleCommentsByTask(
  rows: CommentRowWithReactions[],
): Map<string, Comment[]> {
  const byTask = new Map<string, CommentRowWithReactions[]>();
  for (const r of rows) {
    const arr = byTask.get(r.task_id) ?? [];
    arr.push(r);
    byTask.set(r.task_id, arr);
  }
  const result = new Map<string, Comment[]>();
  for (const [taskId, taskRows] of byTask) {
    const repliesByParent = new Map<string, CommentRowWithReactions[]>();
    for (const r of taskRows) {
      if (r.parent_id) {
        const arr = repliesByParent.get(r.parent_id) ?? [];
        arr.push(r);
        repliesByParent.set(r.parent_id, arr);
      }
    }
    const comments: Comment[] = taskRows
      .filter((r) => r.parent_id == null)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((c) => ({
        id: c.id,
        author_id: c.author_id,
        body: c.body,
        created_at: c.created_at,
        reactions: groupReactions(c.comment_reactions ?? []),
        replies: (repliesByParent.get(c.id) ?? [])
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          )
          .map((rep) => ({
            id: rep.id,
            author_id: rep.author_id,
            body: rep.body,
            created_at: rep.created_at,
            mentions: rep.mentions ?? [],
            reactions: groupReactions(rep.comment_reactions ?? []),
          })),
      }));
    result.set(taskId, comments);
  }
  return result;
}

type CreateTaskPayload = Omit<
  Task,
  "id" | "position" | "created_at" | "updated_at" | "comments" | "assignees"
>;

interface TasksState {
  tasks: Task[];
  /** True while the first Supabase fetch is in flight (live mode only). */
  loading: boolean;
  /** True once a fetch has resolved (or immediately in demo mode). */
  loaded: boolean;
  error: string | null;
  /** Pull tasks (+ assignees) from Supabase into the store (live mode). */
  hydrateFromSupabase: () => Promise<void>;
  /** Realtime: merge a task INSERT/UPDATE (keeps local assignees + comments). */
  applyRealtimeTaskUpsert: (row: TaskRow) => void;
  /** Realtime: remove a task by id. */
  applyRealtimeTaskDelete: (id: string) => void;
  /** Realtime: upsert a task_assignees row (INSERT/UPDATE — status-aware). */
  applyRealtimeAssignmentUpsert: (taskId: string, a: TaskAssignment) => void;
  /** Realtime: remove a task_assignees row (reject/pass/unassign). */
  applyRealtimeAssignmentDelete: (taskId: string, profileId: string) => void;
  /** Realtime: insert a comment/reply row (dedupes by id). */
  applyRealtimeCommentInsert: (row: CommentRow) => void;
  /** Realtime: apply a comment/reply body edit. */
  applyRealtimeCommentUpdate: (row: CommentRow) => void;
  /** Realtime: remove a comment/reply by id. */
  applyRealtimeCommentDelete: (id: string) => void;
  /** Realtime: set a reaction present/absent on a comment/reply (idempotent). */
  applyRealtimeReaction: (
    commentId: string,
    profileId: string,
    emoji: string,
    present: boolean,
  ) => void;
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
  /** Snapshot the board at drag start (for drop-commit rollback / undo). */
  beginTaskDrag: () => void;
  /** Persist the dragged task's final column once + push one notification. */
  commitTaskMove: (taskId: string) => void;
  /** Abandon an in-flight drag, restoring the pre-drag board. */
  cancelTaskDrag: () => void;
  addComment: (taskId: string, body: string) => void;
  editComment: (taskId: string, commentId: string, body: string) => void;
  deleteComment: (taskId: string, commentId: string) => void;
  addReply: (
    taskId: string,
    commentId: string,
    body: string,
    mentionIds: string[],
  ) => void;
  addReaction: (
    taskId: string,
    commentId: string,
    emoji: string,
    userId: string,
  ) => void;
  assignTask: (taskId: string, userId: string | null) => void;
  /** Developer responds to a pending assignment: accept (keeps it) or reject (removes it). */
  respondToAssignment: (
    taskId: string,
    response: "accepted" | "rejected",
    note?: string,
  ) => void;
  /** Developer hands their assignment to another developer (pending for them). */
  passAssignment: (taskId: string, toProfileId: string, note?: string) => void;
  appendLoggedHours: (taskId: string, hours: number) => void;
  bulkUpdateStatus: (taskIds: string[], status: TaskStatus) => void;
  bulkDelete: (taskIds: string[]) => void;
  bulkMoveToSprint: (taskIds: string[], sprintId: string) => void;
}

// Pre-drag board snapshot, set by beginTaskDrag. Module-scoped because a drag is
// a single, transient interaction — no need to put it in (or persist) state.
let dragBefore: Task[] | null = null;

export const useTasksDataStore = create<TasksState>()(
  persist(
    (set, get) => ({
      // Live mode starts empty and hydrates from Supabase; demo seeds locally.
      tasks: isSupabaseConfigured ? [] : [...DUMMY_TASKS],
      loading: isSupabaseConfigured,
      loaded: !isSupabaseConfigured,
      error: null,

      hydrateFromSupabase: async () => {
        if (!isSupabaseConfigured) return;
        set({ loading: true, error: null });
        const supabase = createClient();
        const { data, error } = await supabase
          .from("tasks")
          .select(
            "*, task_assignees(profile_id, status, assigned_by, responded_at, note)",
          )
          .order("position", { ascending: true });
        if (error) {
          set({ loading: false, loaded: true, error: parseSupabaseError(error) });
          return;
        }
        const tasks = ((data ?? []) as unknown as TaskRowWithAssignees[]).map(
          rowToTask,
        );
        // Render the board immediately; comments load right after.
        set({ tasks, loading: false, loaded: true, error: null });

        if (!tasks.length) return;
        const { data: commentData, error: cErr } = await supabase
          .from("task_comments")
          .select("*, comment_reactions(profile_id, emoji)")
          .order("created_at", { ascending: true });
        if (cErr || !commentData) return; // boards stay usable without comments
        const byTask = assembleCommentsByTask(
          commentData as unknown as CommentRowWithReactions[],
        );
        set((s) => ({
          tasks: s.tasks.map((t) => ({
            ...t,
            comments: byTask.get(t.id) ?? [],
          })),
        }));
      },

      // ── Realtime appliers (idempotent — our own writes echo back here too) ──
      applyRealtimeTaskUpsert: (row) => {
        // Don't disrupt an in-progress local drag; the drop commit reconciles.
        if (dragBefore) return;
        set((s) => {
          const existing = s.tasks.find((t) => t.id === row.id);
          if (existing) {
            return {
              tasks: s.tasks.map((t) =>
                t.id === row.id
                  ? {
                      ...t, // keep local assignee_ids + comments
                      title: row.title,
                      description: row.description ?? undefined,
                      status: row.status,
                      priority: row.priority,
                      reporter_id: row.reporter_id,
                      project_id: row.project_id,
                      sprint_id: row.sprint_id,
                      due_date: row.due_date ?? undefined,
                      estimated_hours: row.estimated_hours ?? undefined,
                      logged_hours: row.logged_hours ?? undefined,
                      tags: row.tags,
                      position: row.position,
                      created_at: row.created_at,
                      updated_at: row.updated_at,
                      completed_at: row.completed_at ?? null,
                    }
                  : t,
              ),
            };
          }
          // New task from another user — assignees/comments arrive via their
          // own events (and are already embedded on next full hydrate).
          return {
            tasks: [...s.tasks, rowToTask({ ...row, task_assignees: [] })],
          };
        });
      },

      applyRealtimeTaskDelete: (id) => {
        if (dragBefore) return;
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      },

      applyRealtimeAssignmentUpsert: (taskId, a) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const exists = t.assignees.some(
              (x) => x.profile_id === a.profile_id,
            );
            const assignees = exists
              ? t.assignees.map((x) => (x.profile_id === a.profile_id ? a : x))
              : [...t.assignees, a];
            return { ...t, assignees, assignee_ids: assignees.map((x) => x.profile_id) };
          }),
        })),

      applyRealtimeAssignmentDelete: (taskId, profileId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const assignees = t.assignees.filter(
              (x) => x.profile_id !== profileId,
            );
            return { ...t, assignees, assignee_ids: assignees.map((x) => x.profile_id) };
          }),
        })),

      applyRealtimeCommentInsert: (row) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== row.task_id) return t;
            // Dedupe: skip if the comment or reply is already present.
            const seen = t.comments.some(
              (c) => c.id === row.id || c.replies.some((r) => r.id === row.id),
            );
            if (seen) return t;
            if (row.parent_id == null) {
              const comment: Comment = {
                id: row.id,
                author_id: row.author_id,
                body: row.body,
                created_at: row.created_at,
                reactions: [],
                replies: [],
              };
              return { ...t, comments: [comment, ...t.comments] };
            }
            const reply: Reply = {
              id: row.id,
              author_id: row.author_id,
              body: row.body,
              created_at: row.created_at,
              mentions: row.mentions ?? [],
              reactions: [],
            };
            return {
              ...t,
              comments: t.comments.map((c) =>
                c.id === row.parent_id
                  ? {
                      ...c,
                      replies: [...c.replies, reply].sort(
                        (a, b) =>
                          new Date(a.created_at).getTime() -
                          new Date(b.created_at).getTime(),
                      ),
                    }
                  : c,
              ),
            };
          }),
        })),

      applyRealtimeCommentUpdate: (row) =>
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== row.task_id) return t;
            return {
              ...t,
              comments: t.comments.map((c) =>
                c.id === row.id
                  ? { ...c, body: row.body }
                  : {
                      ...c,
                      replies: c.replies.map((r) =>
                        r.id === row.id ? { ...r, body: row.body } : r,
                      ),
                    },
              ),
            };
          }),
        })),

      applyRealtimeCommentDelete: (id) =>
        set((s) => ({
          // Row delete carries only the PK, so search every task.
          tasks: s.tasks.map((t) => ({
            ...t,
            comments: t.comments
              .filter((c) => c.id !== id)
              .map((c) => ({
                ...c,
                replies: c.replies.filter((r) => r.id !== id),
              })),
          })),
        })),

      applyRealtimeReaction: (commentId, profileId, emoji, present) =>
        set((s) => ({
          tasks: s.tasks.map((t) => ({
            ...t,
            comments: t.comments.map((c) => {
              if (c.id === commentId) {
                return {
                  ...c,
                  reactions: ensureReaction(
                    c.reactions,
                    emoji,
                    profileId,
                    present,
                  ),
                };
              }
              if (c.replies.some((r) => r.id === commentId)) {
                return {
                  ...c,
                  replies: c.replies.map((r) =>
                    r.id === commentId
                      ? {
                          ...r,
                          reactions: ensureReaction(
                            r.reactions,
                            emoji,
                            profileId,
                            present,
                          ),
                        }
                      : r,
                  ),
                };
              }
              return c;
            }),
          })),
        })),

      createTask: (payload) => {
        const now = new Date().toISOString();
        const position = get().tasks.filter(
          (t) =>
            t.status === payload.status && t.project_id === payload.project_id,
        ).length;

        if (!isSupabaseConfigured) {
          const beforeTasks = structuredClone(get().tasks);
          const task: Task = {
            ...payload,
            assignees: payload.assignee_ids.map((pid) =>
              newAssignment(pid, payload.reporter_id),
            ),
            id: nextTaskId(get().tasks),
            position,
            created_at: now,
            updated_at: now,
            comments: [],
          };
          set((s) => ({ tasks: [...s.tasks, task] }));
          offerUndoToast(
            "Task created",
            () => useTasksDataStore.setState({ tasks: beforeTasks }),
            task.title.trim() || undefined,
          );
          pushWorkspaceActivity(
            withProjectScope(`Created task "${titleOf(task)}"`, task.project_id),
            taskBoardRelativePath(task),
            task.project_id,
          );
          notifyAboutTask(
            task.assignee_ids,
            `${actorName()} assigned you a new task: "${titleOf(task)}"`,
            task,
          );
          return;
        }

        // ── Supabase: optimistic insert with a client-generated UUID (no
        // temp→real swap), reconcile on response.
        void (async () => {
          const reporterId = useAuthStore.getState().user.authId;
          if (!reporterId) {
            toast.error("Couldn't create task", {
              description: "You need to be signed in.",
            });
            return;
          }
          // Real id client-side (no temp→real swap) so the row is stable even
          // if the user acts on it before the insert returns.
          const id = crypto.randomUUID();
          const optimistic: Task = {
            ...payload,
            reporter_id: reporterId,
            assignees: payload.assignee_ids.map((pid) =>
              newAssignment(pid, reporterId),
            ),
            id,
            position,
            created_at: now,
            updated_at: now,
            comments: [],
          };
          set((s) => ({ tasks: [...s.tasks, optimistic] }));

          const supabase = createClient();
          const { data, error } = await supabase
            .from("tasks")
            .insert({
              id,
              project_id: payload.project_id,
              sprint_id: payload.sprint_id ?? null,
              title: payload.title,
              description: payload.description ?? null,
              status: payload.status,
              priority: payload.priority,
              reporter_id: reporterId,
              due_date: payload.due_date ?? null,
              estimated_hours: payload.estimated_hours ?? null,
              logged_hours: payload.logged_hours ?? null,
              tags: payload.tags,
              // Set only by an estimate sync; null for a hand-made task, which
              // is what keeps the sync from ever touching one.
              source_line_item_id: payload.source_line_item_id ?? null,
              position,
            })
            .select()
            .single();

          if (error || !data) {
            set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
            toast.error("Couldn't create task", {
              description: parseSupabaseError(error),
            });
            return;
          }

          if (payload.assignee_ids.length) {
            const { error: aErr } = await supabase
              .from("task_assignees")
              .insert(
                payload.assignee_ids.map((profile_id) => {
                  const a = newAssignment(profile_id, reporterId);
                  return {
                    task_id: data.id,
                    profile_id,
                    status: a.status,
                    assigned_by: a.assigned_by,
                    responded_at: a.responded_at,
                  };
                }),
              );
            if (aErr) {
              toast.error("Task created, but assignees didn't save", {
                description: parseSupabaseError(aErr),
              });
            }
          }

          const saved = rowToTask({
            ...(data as TaskRow),
            task_assignees: payload.assignee_ids.map((profile_id) => {
              const a = newAssignment(profile_id, reporterId);
              return {
                profile_id,
                status: a.status,
                assigned_by: a.assigned_by ?? null,
                responded_at: a.responded_at ?? null,
                note: null,
              };
            }),
          });
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? saved : t)),
          }));
          toast.success("Task created");
          pushWorkspaceActivity(
            withProjectScope(`Created task "${titleOf(saved)}"`, saved.project_id),
            taskBoardRelativePath(saved),
            saved.project_id,
          );
          notifyAboutTask(
            saved.assignee_ids,
            `${actorName()} assigned you a new task: "${titleOf(saved)}"`,
            saved,
          );
        })();
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
        const now = new Date().toISOString();
        // Assignees changing → merge onto existing (new people become pending).
        const assignerId = useAuthStore.getState().user.authId ?? CURRENT_USER_ID;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t;
            const next: Task = { ...t, ...normalized, updated_at: now };
            if (normalized.assignee_ids !== undefined) {
              next.assignees = mergeAssigneesForIds(
                t.assignees,
                normalized.assignee_ids,
                assignerId,
              );
              next.assignee_ids = next.assignees.map((a) => a.profile_id);
            }
            return next;
          }),
        }));

        // A seeded task's title/hours belong to the estimate too — push the
        // change back onto its line item so the quote and the plan agree.
        // `revertMirror` undoes that write; this task update is optimistic, and
        // an estimate left holding a change the project rolled back is a line
        // item silently repriced by a failed request.
        const revertMirror =
          normalized.title !== undefined || normalized.estimated_hours !== undefined
            ? mirrorTaskChange({
                kind: "update",
                task: snapshot,
                patch: {
                  title: normalized.title,
                  estimated_hours: normalized.estimated_hours ?? undefined,
                },
              })
            : null;

        // Notify anyone newly assigned (they must accept or decline).
        const addedIds =
          normalized.assignee_ids !== undefined
            ? addedAssigneeIds(snapshot.assignee_ids, normalized.assignee_ids)
            : [];
        if (addedIds.length) {
          const t = get().tasks.find((x) => x.id === id);
          if (t) {
            notifyAssigneesUpdated(t);
            notifyAboutTask(
              addedIds,
              `${actorName()} assigned you a task: "${titleOf(t)}" — accept or decline`,
              t,
            );
          }
        }

        if (!isSupabaseConfigured) {
          offerUndoToast("Task updated", () => {
            useTasksDataStore.setState((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === id ? structuredClone(snapshot) : t,
              ),
            }));
            revertMirror?.();
          });
          const merged = get().tasks.find((t) => t.id === id)!;
          pushWorkspaceActivity(
            withProjectScope(`Updated task "${titleOf(merged)}"`, merged.project_id),
            taskBoardRelativePath(merged),
            merged.project_id,
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          const fields: Database["public"]["Tables"]["tasks"]["Update"] = {
            updated_at: now,
          };
          if (normalized.title !== undefined) fields.title = normalized.title;
          if (normalized.description !== undefined)
            fields.description = normalized.description ?? null;
          if (normalized.status !== undefined) fields.status = normalized.status;
          if (normalized.priority !== undefined)
            fields.priority = normalized.priority;
          if (normalized.sprint_id !== undefined)
            fields.sprint_id = normalized.sprint_id ?? null;
          if (normalized.due_date !== undefined)
            fields.due_date = normalized.due_date ?? null;
          if (normalized.estimated_hours !== undefined)
            fields.estimated_hours = normalized.estimated_hours ?? null;
          // logged_hours is never sent: the database derives it from
          // time_entries (0048) and refuses a direct write.
          if (normalized.tags !== undefined) fields.tags = normalized.tags;
          if (normalized.position !== undefined)
            fields.position = normalized.position;

          const { error } = await supabase
            .from("tasks")
            .update(fields)
            .eq("id", id);

          let assigneeErr: { message?: string } | null = null;
          if (!error && normalized.assignee_ids !== undefined) {
            const res = await syncAssigneeDiff(
              supabase,
              id,
              snapshot.assignees,
              normalized.assignee_ids,
              assignerId,
            );
            assigneeErr = res.error;
          }

          if (error || assigneeErr) {
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === id ? structuredClone(snapshot) : t,
              ),
            }));
            revertMirror?.();
            toast.error("Couldn't update task", {
              description: parseSupabaseError(error ?? assigneeErr),
            });
            return;
          }
          toast.success("Task updated");
          const merged = get().tasks.find((t) => t.id === id);
          if (merged) {
            pushWorkspaceActivity(
              withProjectScope(`Updated task "${titleOf(merged)}"`, merged.project_id),
              taskBoardRelativePath(merged),
              merged.project_id,
            );
          }
        })();
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        const beforeTasks = structuredClone(get().tasks);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        // Dropping seeded work drops it from the estimate too, otherwise the
        // next sync would just put the task back.
        const revertMirror = task ? mirrorTaskChange({ kind: "delete", task }) : null;

        if (!isSupabaseConfigured) {
          offerUndoToast("Task deleted", () => {
            useTasksDataStore.setState({ tasks: beforeTasks });
            revertMirror?.();
          });
          if (task) {
            pushWorkspaceActivity(
              withProjectScope(`Deleted task "${titleOf(task)}"`, task.project_id),
              taskBoardRelativePath(task),
              task.project_id,
            );
            notifyAboutTask(
              taskRecipients(task),
              `${actorName()} deleted "${titleOf(task)}"`,
              task,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase.from("tasks").delete().eq("id", id);
          if (error) {
            set({ tasks: beforeTasks });
            revertMirror?.();
            toast.error("Couldn't delete task", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success("Task deleted");
          if (task) {
            pushWorkspaceActivity(
              withProjectScope(`Deleted task "${titleOf(task)}"`, task.project_id),
              taskBoardRelativePath(task),
              task.project_id,
            );
            notifyAboutTask(
              taskRecipients(task),
              `${actorName()} deleted "${titleOf(task)}"`,
              task,
            );
          }
        })();
      },

      // moveTask / reorderTask are LOCAL-ONLY: they run repeatedly during a drag
      // (drag-over previews the card between columns). Nothing is persisted and
      // no notification is pushed here — that happens once on drop in
      // commitTaskMove. beginTaskDrag snapshots state for undo/rollback.
      moveTask: (taskId, toStatus, toIndex) => {
        const exists = get().tasks.find((t) => t.id === taskId);
        if (!exists) return;
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
      },

      reorderTask: (taskId, _fromIndex, toIndex, status) => {
        const sorted = get()
          .tasks.filter((t) => t.status === status)
          .sort((a, b) => a.position - b.position);
        if (sorted.findIndex((t) => t.id === taskId) === -1) return;
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
      },

      beginTaskDrag: () => {
        dragBefore = structuredClone(get().tasks);
      },

      cancelTaskDrag: () => {
        if (dragBefore) set({ tasks: dragBefore });
        dragBefore = null;
      },

      commitTaskMove: (taskId) => {
        const before = dragBefore;
        dragBefore = null;
        const task = get().tasks.find((t) => t.id === taskId);
        if (!task) return;

        if (!isSupabaseConfigured) {
          if (before) {
            const snapshot = before;
            offerUndoToast("Task moved", () =>
              useTasksDataStore.setState({ tasks: snapshot }),
            );
          }
          pushWorkspaceActivity(
            withProjectScope(
              `moved "${titleOf(task)}" to ${columnLabel(task.status)}`,
              task.project_id,
            ),
            taskBoardRelativePath(task),
            task.project_id,
          );
          notifyAboutTask(
            taskRecipients(task),
            `${actorName()} moved "${titleOf(task)}" to ${columnLabel(task.status)}`,
            task,
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          const now = new Date().toISOString();
          // Persist the task's final column (status + position for every row).
          //
          // Scoped to THIS board — same project, same sprint (or the same
          // backlog). Filtering on status alone swept in every task in the
          // workspace that happened to share it, so dropping one card into Done
          // rewrote unrelated tasks in other projects: N pointless writes, and
          // an `updated_at` bump on rows nobody touched. That timestamp is what
          // the on-time-delivery figure reads as a completion time, so the churn
          // quietly corrupted it project-wide.
          const colRows = get()
            .tasks.filter(
              (t) =>
                t.status === task.status &&
                t.project_id === task.project_id &&
                t.sprint_id === task.sprint_id,
            )
            .map((t) => ({ id: t.id, position: t.position }));
          const results = await Promise.all(
            colRows.map((r) =>
              supabase
                .from("tasks")
                .update({
                  status: task.status,
                  position: r.position,
                  updated_at: now,
                })
                .eq("id", r.id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            if (before) set({ tasks: before });
            toast.error("Couldn't save the board", {
              description: parseSupabaseError(failed.error),
            });
            return;
          }
          pushWorkspaceActivity(
            withProjectScope(
              `moved "${titleOf(task)}" to ${columnLabel(task.status)}`,
              task.project_id,
            ),
            taskBoardRelativePath(task),
            task.project_id,
          );
          notifyAboutTask(
            taskRecipients(task),
            `${actorName()} moved "${titleOf(task)}" to ${columnLabel(task.status)}`,
            task,
          );
        })();
      },

      addComment: (taskId, body) => {
        const id = isSupabaseConfigured ? crypto.randomUUID() : uid();
        const author_id = currentAuthorId();
        const comment: Comment = {
          id,
          author_id,
          body,
          created_at: new Date().toISOString(),
          reactions: [],
          replies: [],
        };
        const before = structuredClone(get().tasks);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, comments: [comment, ...t.comments] } : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) {
          notifyCommentAdded(task);
          notifyAboutTask(
            taskRecipients(task),
            `${actorName()} commented on "${titleOf(task)}": "${bodyPreview(body)}"`,
            task,
          );
        }

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("task_comments")
            .insert({ id, task_id: taskId, author_id, body, parent_id: null });
          if (error) {
            set({ tasks: before });
            toast.error("Couldn't post comment", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      editComment: (taskId, commentId, body) => {
        const before = structuredClone(get().tasks);
        // Match a top-level comment OR a nested reply by id.
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) =>
                    c.id === commentId
                      ? { ...c, body }
                      : {
                          ...c,
                          replies: c.replies.map((r) =>
                            r.id === commentId ? { ...r, body } : r,
                          ),
                        },
                  ),
                }
              : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyCommentEdited(task);

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("task_comments")
            .update({ body })
            .eq("id", commentId);
          if (error) {
            set({ tasks: before });
            toast.error("Couldn't update comment", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      deleteComment: (taskId, commentId) => {
        const before = structuredClone(get().tasks);
        // Remove a top-level comment OR a nested reply by id.
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments
                    .filter((c) => c.id !== commentId)
                    .map((c) => ({
                      ...c,
                      replies: c.replies.filter((r) => r.id !== commentId),
                    })),
                }
              : t,
          ),
        }));
        const task = get().tasks.find((t) => t.id === taskId);
        if (task) notifyCommentRemoved(task);

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          // Cascade removes child replies + reactions in the DB.
          const { error } = await supabase
            .from("task_comments")
            .delete()
            .eq("id", commentId);
          if (error) {
            set({ tasks: before });
            toast.error("Couldn't delete comment", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      addReply: (taskId, commentId, body, mentionIds) => {
        const id = isSupabaseConfigured ? crypto.randomUUID() : uid();
        const author_id = currentAuthorId();
        const reply = {
          id,
          author_id,
          body,
          created_at: new Date().toISOString(),
          mentions: mentionIds,
          reactions: [],
        };
        const before = structuredClone(get().tasks);
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
        if (task) {
          notifyReplyAdded(task, mentionIds.length);
          notifyAboutTask(
            commentRecipients(task, mentionIds),
            `${actorName()} replied on "${titleOf(task)}": "${bodyPreview(body)}"`,
            task,
          );
        }

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = await supabase.from("task_comments").insert({
            id,
            task_id: taskId,
            author_id,
            body,
            parent_id: commentId,
            mentions: mentionIds,
          });
          if (error) {
            set({ tasks: before });
            toast.error("Couldn't post reply", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      addReaction: (taskId, commentId, emoji, userId) => {
        // The target can be a top-level comment OR a reply (both are
        // task_comments rows / reactable in the UI). Capture pre-toggle state
        // so the DB call knows whether to insert or delete.
        const task0 = get().tasks.find((t) => t.id === taskId);
        let target: Comment | Reply | undefined;
        let targetKind: "comment" | "reply" = "comment";
        for (const c of task0?.comments ?? []) {
          if (c.id === commentId) {
            target = c;
            targetKind = "comment";
            break;
          }
          const rep = c.replies.find((r) => r.id === commentId);
          if (rep) {
            target = rep;
            targetKind = "reply";
            break;
          }
        }
        const had =
          target?.reactions
            .find((r) => r.emoji === emoji)
            ?.userIds.includes(userId) ?? false;
        const before = structuredClone(get().tasks);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  comments: t.comments.map((c) => {
                    if (c.id === commentId) {
                      return {
                        ...c,
                        reactions: toggleReactionList(
                          c.reactions,
                          emoji,
                          userId,
                        ),
                      };
                    }
                    if (c.replies.some((r) => r.id === commentId)) {
                      return {
                        ...c,
                        replies: c.replies.map((r) =>
                          r.id === commentId
                            ? {
                                ...r,
                                reactions: toggleReactionList(
                                  r.reactions,
                                  emoji,
                                  userId,
                                ),
                              }
                            : r,
                        ),
                      };
                    }
                    return c;
                  }),
                }
              : t,
          ),
        }));

        // Notify the comment/reply author when a reaction is ADDED (not removed).
        if (task0 && target && !had && target.author_id) {
          notifyAboutTask(
            [target.author_id],
            `${actorName()} reacted ${emoji} to your ${targetKind}: "${bodyPreview(target.body)}"`,
            task0,
          );
        }

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } = had
            ? await supabase
                .from("comment_reactions")
                .delete()
                .eq("comment_id", commentId)
                .eq("profile_id", userId)
                .eq("emoji", emoji)
            : await supabase
                .from("comment_reactions")
                .insert({ comment_id: commentId, profile_id: userId, emoji });
          if (error) {
            set({ tasks: before });
            toast.error("Couldn't update reaction", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      assignTask: (taskId, userId) => {
        const beforeTasks = structuredClone(get().tasks);
        const prev = get().tasks.find((t) => t.id === taskId);
        if (!prev) return;
        const assignerId =
          useAuthStore.getState().user.authId ?? CURRENT_USER_ID;
        const newIds =
          userId == null
            ? []
            : prev.assignee_ids.includes(userId)
              ? prev.assignee_ids.filter((x) => x !== userId)
              : [...prev.assignee_ids, userId];

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const assignees = mergeAssigneesForIds(
              t.assignees,
              newIds,
              assignerId,
            );
            return {
              ...t,
              assignees,
              assignee_ids: assignees.map((a) => a.profile_id),
              updated_at: new Date().toISOString(),
            };
          }),
        }));

        const added = addedAssigneeIds(prev.assignee_ids, newIds);
        const task = get().tasks.find((t) => t.id === taskId);
        if (task && added.length) {
          notifyAssigneesUpdated(task);
          notifyAboutTask(
            added,
            `${actorName()} assigned you a task: "${titleOf(task)}" — accept or decline`,
            task,
          );
        }

        if (!isSupabaseConfigured) {
          offerUndoToast("Assignees updated", () =>
            useTasksDataStore.setState({ tasks: beforeTasks }),
          );
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await syncAssigneeDiff(
            supabase,
            taskId,
            prev.assignees,
            newIds,
            assignerId,
          );
          if (error) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't update assignees", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      respondToAssignment: (taskId, response, note) => {
        const me = useAuthStore.getState().user.authId ?? CURRENT_USER_ID;
        const beforeTasks = structuredClone(get().tasks);
        const task0 = get().tasks.find((t) => t.id === taskId);
        const mine = task0?.assignees.find((a) => a.profile_id === me);
        if (!task0 || !mine) return;
        const assigner = mine.assigned_by ?? task0.reporter_id;
        const now = new Date().toISOString();

        // Optimistic: accept updates my status; reject removes me.
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            if (response === "rejected") {
              const assignees = t.assignees.filter((a) => a.profile_id !== me);
              return {
                ...t,
                assignees,
                assignee_ids: assignees.map((a) => a.profile_id),
              };
            }
            const assignees = t.assignees.map((a) =>
              a.profile_id === me
                ? { ...a, status: "accepted" as AssignmentStatus, responded_at: now }
                : a,
            );
            return { ...t, assignees };
          }),
        }));

        const verb = response === "accepted" ? "accepted" : "declined";
        pushWorkspaceActivity(
          withProjectScope(
            `${verb} the task "${titleOf(task0)}"`,
            task0.project_id,
          ),
          taskBoardRelativePath(task0),
          task0.project_id,
        );
        notifyAboutTask(
          assigner ? [assigner] : [],
          `${actorName()} ${verb} "${titleOf(task0)}"${note ? `: "${bodyPreview(note)}"` : ""}`,
          task0,
        );

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const { error } =
            response === "rejected"
              ? await supabase
                  .from("task_assignees")
                  .delete()
                  .eq("task_id", taskId)
                  .eq("profile_id", me)
              : await supabase
                  .from("task_assignees")
                  .update({ status: "accepted", responded_at: now, note: note ?? null })
                  .eq("task_id", taskId)
                  .eq("profile_id", me);
          if (error) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't save your response", {
              description: parseSupabaseError(error),
            });
          }
        })();
      },

      passAssignment: (taskId, toProfileId, note) => {
        const me = useAuthStore.getState().user.authId ?? CURRENT_USER_ID;
        const beforeTasks = structuredClone(get().tasks);
        const task0 = get().tasks.find((t) => t.id === taskId);
        const mine = task0?.assignees.find((a) => a.profile_id === me);
        if (!task0 || !mine || toProfileId === me) return;
        const assigner = mine.assigned_by ?? task0.reporter_id;

        // Optimistic: remove me, add the target as pending (assigned by me).
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const kept = t.assignees.filter((a) => a.profile_id !== me);
            const already = kept.some((a) => a.profile_id === toProfileId);
            const assignees = already
              ? kept
              : [...kept, newAssignment(toProfileId, me)];
            return {
              ...t,
              assignees,
              assignee_ids: assignees.map((a) => a.profile_id),
            };
          }),
        }));

        const task = get().tasks.find((t) => t.id === taskId);
        if (task) {
          pushWorkspaceActivity(
            withProjectScope(
              `passed the task "${titleOf(task)}" to a teammate`,
              task.project_id,
            ),
            taskBoardRelativePath(task),
            task.project_id,
          );
          notifyAboutTask(
            [toProfileId],
            `${actorName()} passed you a task: "${titleOf(task)}" — accept or decline`,
            task,
          );
          notifyAboutTask(
            assigner ? [assigner] : [],
            `${actorName()} passed "${titleOf(task)}" to another developer`,
            task,
          );
        }

        if (!isSupabaseConfigured) return;
        void (async () => {
          const supabase = createClient();
          const del = await supabase
            .from("task_assignees")
            .delete()
            .eq("task_id", taskId)
            .eq("profile_id", me);
          let insErr: { message?: string } | null = del.error;
          if (!insErr) {
            const a = newAssignment(toProfileId, me);
            const ins = await supabase.from("task_assignees").insert({
              task_id: taskId,
              profile_id: toProfileId,
              status: a.status,
              assigned_by: me,
              note: note ?? null,
            });
            insErr = ins.error;
          }
          if (insErr) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't pass the task", {
              description: parseSupabaseError(insErr),
            });
          }
        })();
      },

      appendLoggedHours: (taskId, hours) => {
        if (hours <= 0) return;
        const beforeTasks = structuredClone(get().tasks);
        const now = new Date().toISOString();
        const apply = () =>
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    logged_hours: roundWorkHours((t.logged_hours ?? 0) + hours),
                    updated_at: now,
                  }
                : t,
            ),
          }));

        if (!isSupabaseConfigured) {
          apply();
          const task = get().tasks.find((t) => t.id === taskId);
          offerUndoToast("Logged time updated", () =>
            useTasksDataStore.setState({ tasks: beforeTasks }),
          );
          if (task) {
            pushWorkspaceActivity(
              withProjectScope(`Logged time on "${titleOf(task)}"`, task.project_id),
              taskBoardRelativePath(task),
              task.project_id,
            );
          }
          return;
        }

        // Only the ENTRY is written. `time_entries` is the record (it backs
        // every per-person figure) and the database derives the task's
        // `logged_hours` from it (0048) — the client used to write that total
        // as an absolute number, so it could be set to anything. The local
        // total moves once the entry is stored, so `useWeekLoggedHours` (keyed
        // on it) re-reads a week that already contains the entry; the realtime
        // echo of the trigger's update then confirms the figure.
        void (async () => {
          const loggerId = useAuthStore.getState().user.authId;
          if (!loggerId) return;
          const supabase = createClient();
          const entry = await supabase
            .from("time_entries")
            .insert({ task_id: taskId, profile_id: loggerId, hours });
          if (entry.error) {
            toast.error("Couldn't log time", {
              description: parseSupabaseError(entry.error),
            });
            return;
          }
          apply();
          const task = get().tasks.find((t) => t.id === taskId);
          if (task) {
            pushWorkspaceActivity(
              withProjectScope(`Logged time on "${titleOf(task)}"`, task.project_id),
              taskBoardRelativePath(task),
              task.project_id,
            );
          }
        })();
      },

      bulkUpdateStatus: (taskIds, status) => {
        if (!taskIds.length) return;
        const beforeTasks = structuredClone(get().tasks);
        const now = new Date().toISOString();
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id) ? { ...t, status, updated_at: now } : t,
          ),
        }));
        const n = taskIds.length;
        const toastMsg = n === 1 ? "Task status updated" : `${n} tasks updated`;
        const activityMsg = `updated status on ${n === 1 ? "a task" : `${n} tasks`}`;
        const primary = taskIds
          .map((tid) => beforeTasks.find((t) => t.id === tid))
          .find(Boolean);

        if (!isSupabaseConfigured) {
          offerUndoToast(toastMsg, () =>
            useTasksDataStore.setState({ tasks: beforeTasks }),
          );
          if (primary) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, primary.project_id),
              taskBoardRelativePath({ ...primary, status }),
              primary.project_id,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tasks")
            .update({ status, updated_at: now })
            .in("id", taskIds);
          if (error) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't update tasks", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success(toastMsg);
          if (primary) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, primary.project_id),
              taskBoardRelativePath({ ...primary, status }),
              primary.project_id,
            );
          }
        })();
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
        const activityMsg = `deleted ${n === 1 ? "a task" : `${n} tasks`}`;

        if (!isSupabaseConfigured) {
          offerUndoToast(toastMsg, () =>
            useTasksDataStore.setState({ tasks: beforeTasks }),
          );
          if (anchor) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, anchor.project_id),
              projectOverviewHref(anchor.project_id),
              anchor.project_id,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tasks")
            .delete()
            .in("id", taskIds);
          if (error) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't delete tasks", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success(toastMsg);
          if (anchor) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, anchor.project_id),
              projectOverviewHref(anchor.project_id),
              anchor.project_id,
            );
          }
        })();
      },

      bulkMoveToSprint: (taskIds, sprintId) => {
        if (!taskIds.length) return;
        const beforeTasks = structuredClone(get().tasks);
        const now = new Date().toISOString();
        const anchor = taskIds
          .map((id) => beforeTasks.find((t) => t.id === id))
          .find(Boolean);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id)
              ? { ...t, sprint_id: sprintId, updated_at: now }
              : t,
          ),
        }));
        const n = taskIds.length;
        const toastMsg =
          n === 1 ? "Task moved to sprint" : `${n} tasks moved to sprint`;
        const activityMsg = `moved ${n === 1 ? "a task" : `${n} tasks`} to a sprint`;

        if (!isSupabaseConfigured) {
          offerUndoToast(toastMsg, () =>
            useTasksDataStore.setState({ tasks: beforeTasks }),
          );
          if (anchor) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, anchor.project_id),
              sprintTasksHref(anchor.project_id, sprintId),
              anchor.project_id,
            );
          }
          return;
        }

        void (async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("tasks")
            .update({ sprint_id: sprintId, updated_at: now })
            .in("id", taskIds);
          if (error) {
            set({ tasks: beforeTasks });
            toast.error("Couldn't move tasks", {
              description: parseSupabaseError(error),
            });
            return;
          }
          toast.success(toastMsg);
          if (anchor) {
            pushWorkspaceActivity(
              withProjectScope(activityMsg, anchor.project_id),
              sprintTasksHref(anchor.project_id, sprintId),
              anchor.project_id,
            );
          }
        })();
      },
    }),
    {
      name: "timeline-tasks",
      version: 2,
      // Live data is the source-of-truth in Supabase and re-fetched on load;
      // demo mode keeps persisting to localStorage.
      partialize: (s) =>
        isSupabaseConfigured ? { tasks: [] } : { tasks: s.tasks },
      migrate: (persisted) => {
        if (isSupabaseConfigured) {
          return {
            ...(persisted as object),
            tasks: [],
          } as unknown as TasksState;
        }
        return persisted as TasksState;
      },
    },
  ),
);
