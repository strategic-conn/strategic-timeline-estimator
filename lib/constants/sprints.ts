export function sprintTasksHref(projectId: string, sprintId: string): string {
  return `/projects/${projectId}/sprints/${sprintId}`;
}

export function backlogHref(projectId: string): string {
  return `/projects/${projectId}/backlog`;
}

export function projectOverviewHref(projectId: string): string {
  return `/projects/${projectId}`;
}
