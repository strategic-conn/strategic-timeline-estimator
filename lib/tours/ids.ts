/**
 * Every element a tour can point at, by a stable `data-tour` id.
 *
 * Steps anchor on these attributes — never on classes or text — so restyling
 * a page cannot silently break its tour, and renaming an id is a type error in
 * both the component and the tour. `e2e/tours.spec.ts` checks the ids exist.
 *
 * One id may sit on several elements when the same idea lives in different
 * places per layout tier (the nav is a sidebar from md up and a bottom tab bar
 * below it). The runner uses the first one that is actually visible.
 */
export const TOUR_TARGETS = [
  // Shell
  "nav",
  "help",
  "notifications",
  "theme",
  "new-project",
  "add-task",
  "user-card",
  "scope-toggle",
  // Dashboard
  "dashboard.kpis",
  "dashboard.due-soon",
  "dashboard.my-work",
  "dashboard.quick-actions",
  "dashboard.activity",
  "dashboard.checklist",
  "dashboard.team",
  "dashboard.team-chart",
  "dashboard.team-table",
  // Projects
  "projects.search",
  "projects.new",
  "projects.grid",
  "projects.empty",
  // Project overview
  "project.sprints",
  "project.empty",
  "project.backlog",
  "project.new-sprint",
  "project.sync",
  "project.zoho-complete",
  "project.timeline",
  "project.risk-buffer",
  "project.velocity",
  // Task board (sprint + backlog)
  "board.search",
  "board.filters",
  "board.views",
  "board.add-task",
  "board.kanban",
  "board.card",
  // Calendar
  "calendar.nav",
  "calendar.month",
  "calendar.day",
  "calendar.legend",
  // Timeline
  "gantt.project-picker",
  "gantt.how-to-read",
  "gantt.legend",
  "gantt.chart",
  // Workload
  "workload.mine",
  "workload.pending",
  "workload.mine-work",
  "workload.team",
  "workload.people",
  "workload.capacity",
  // Team
  "team.invite",
  "team.members",
  "team.skills",
  "team.roles",
  // Activity + Reports
  "activity.filters",
  "activity.feed",
  "reports.kpis",
  "reports.status",
  "reports.projects",
  "reports.people",
  // Estimator list
  "estimator.views",
  "estimator.import",
  "estimator.new",
  "estimator.list",
  "estimator.board",
  "estimator.empty",
  // Estimator editor
  "estimate.status",
  "estimate.export",
  "estimate.tabs",
  "estimate.setup",
  "estimate.client",
  "estimate.platform",
  "estimate.guided",
  "estimate.guided-start",
  "estimate.scope-summary",
  "estimate.generate",
  "estimate.lines",
  "estimate.catalog",
  "estimate.line-list",
  "estimate.adjust",
  "estimate.requirements",
  "estimate.risk-buffer",
  "estimate.rates",
  "estimate.addons",
  "estimate.review",
  "estimate.preview",
  "estimate.send-zoho",
  // Settings
  "settings.tabs",
  "settings.profile",
  "settings.avatar",
  "settings.skills",
  "settings.timeoff",
  "settings.request-timeoff",
  "settings.approvals",
  "settings.workspace",
  "settings.rates",
  "settings.zoho",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** Spread onto an element: `<div {...tourAnchor("dashboard.kpis")}>`. */
export function tourAnchor(id: TourTarget): { "data-tour": TourTarget } {
  return { "data-tour": id };
}

export function tourSelector(id: TourTarget): string {
  return `[data-tour="${id}"]`;
}

/**
 * The first element carrying `id` that a person could actually see — rendered,
 * non-zero size, not hidden by an ancestor. `null` when none is.
 */
export function findTourTarget(id: TourTarget): HTMLElement | null {
  if (typeof document === "undefined") return null;
  for (const el of document.querySelectorAll<HTMLElement>(tourSelector(id))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    // `checkVisibility` also catches display:none ancestors; older engines lack it.
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
    return el;
  }
  return null;
}
