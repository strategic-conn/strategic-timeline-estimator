/** Demo default: dummy tasks in `lib/dummy/tasks.data.ts` use this `project_id`. */
export const DEMO_DEFAULT_PROJECT_ID = "proj-1";

/** Link to a project's overview (sprint list). */
export function projectOverviewHref(projectId: string): string {
  return `/projects/${projectId}`;
}

/**
 * @deprecated — Use `projectOverviewHref` or `sprintTasksHref` from sprints constants.
 * Kept for backward-compat; now redirects to the project overview.
 */
export function projectTasksHref(projectId: string): string {
  return `/projects/${projectId}`;
}
