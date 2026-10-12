/**
 * Blank projects (New project) are switched off: every project starts from an
 * approved estimate via Start project, so its sprints, tasks, PO and deal all
 * hang off one record. The button stays on /projects, disabled, saying why —
 * flip this to bring it back. ponytail: a constant, not a setting, until
 * someone needs it per workspace.
 */
export const BLANK_PROJECTS_ENABLED = false;

/** Explains the disabled button wherever it is shown. */
export const BLANK_PROJECTS_OFF_REASON =
  "Projects start from an approved estimate — use Start project in the Estimator.";

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
