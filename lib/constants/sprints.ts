import { TASK_FOCUS_QUERY_PARAM } from "@/lib/constants/task-focus";

export function sprintTasksHref(
  projectId: string,
  sprintId: string,
  focusTaskId?: string
): string {
  const base = `/projects/${projectId}/sprints/${sprintId}`;
  if (focusTaskId) {
    const q = new URLSearchParams({ [TASK_FOCUS_QUERY_PARAM]: focusTaskId });
    return `${base}?${q}`;
  }
  return base;
}

export function backlogHref(projectId: string, focusTaskId?: string): string {
  const base = `/projects/${projectId}/backlog`;
  if (focusTaskId) {
    const q = new URLSearchParams({ [TASK_FOCUS_QUERY_PARAM]: focusTaskId });
    return `${base}?${q}`;
  }
  return base;
}

export function projectOverviewHref(projectId: string): string {
  return `/projects/${projectId}`;
}
