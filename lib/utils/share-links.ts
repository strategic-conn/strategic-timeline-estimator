import { backlogHref, projectOverviewHref, sprintTasksHref } from "@/lib/constants/sprints";
import type { Task } from "@/types/task.types";

/** Board URL (path + query) that opens the task with focus. */
export function taskBoardRelativePath(task: Task): string {
  if (task.sprint_id) {
    return sprintTasksHref(task.project_id, task.sprint_id, task.id);
  }
  return backlogHref(task.project_id, task.id);
}

export function toAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${p}`;
}

export function taskShareUrl(task: Task): string {
  return toAbsoluteUrl(taskBoardRelativePath(task));
}

export function projectShareUrl(projectId: string): string {
  return toAbsoluteUrl(projectOverviewHref(projectId));
}

export function sprintShareUrl(projectId: string, sprintId: string): string {
  return toAbsoluteUrl(sprintTasksHref(projectId, sprintId));
}

export function backlogShareUrl(projectId: string): string {
  return toAbsoluteUrl(backlogHref(projectId));
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
