import { useNotificationsStore } from "@/store/notifications-store";
import { taskBoardRelativePath } from "@/lib/utils/share-links";
import type { Task } from "@/types/task.types";

function ellipsizeTitle(title: string, max = 72): string {
  const t = title.trim() || "Untitled task";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type TaskNotifyFields = Pick<Task, "id" | "title" | "project_id" | "sprint_id">;

/**
 * Adds a row to the persisted notifications feed (and bell), with a deep link
 * to the task board + ?task= so “collaboration” survives refresh in this demo.
 */
export function notifyTaskActivity(summary: string, task: TaskNotifyFields): void {
  const href = taskBoardRelativePath(task as Task);
  useNotificationsStore.getState().push(summary, href, task.project_id);
}

export function notifyCommentAdded(task: TaskNotifyFields): void {
  notifyTaskActivity(`Comment on “${ellipsizeTitle(task.title)}”`, task);
}

export function notifyReplyAdded(
  task: TaskNotifyFields,
  mentionCount: number
): void {
  const extra =
    mentionCount > 0 ? ` · ${mentionCount} mention${mentionCount === 1 ? "" : "s"}` : "";
  notifyTaskActivity(`Reply on “${ellipsizeTitle(task.title)}”${extra}`, task);
}

export function notifyCommentEdited(task: TaskNotifyFields): void {
  notifyTaskActivity(`Comment updated on “${ellipsizeTitle(task.title)}”`, task);
}

export function notifyCommentRemoved(task: TaskNotifyFields): void {
  notifyTaskActivity(`Comment removed on “${ellipsizeTitle(task.title)}”`, task);
}

export function notifyAssigneesUpdated(task: TaskNotifyFields): void {
  notifyTaskActivity(`Assignees updated on “${ellipsizeTitle(task.title)}”`, task);
}
