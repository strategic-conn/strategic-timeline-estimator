import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CheckSquare,
  Clock,
  FolderKanban,
  MessageSquare,
  Milestone,
  Smile,
  UserPlus,
} from "lucide-react";

/**
 * Activity categories are derived from the log text (which our stores generate
 * with consistent phrasing), so no schema/backfill is needed and it works for
 * existing rows. Used for the colored indicator + the "filter by activity" menu.
 */
export type ActivityCategory =
  | "task"
  | "project"
  | "sprint"
  | "comment"
  | "assignment"
  | "reaction"
  | "time"
  | "other";

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "task",
  "project",
  "sprint",
  "comment",
  "assignment",
  "reaction",
  "time",
  "other",
];

export const ACTIVITY_CATEGORY_META: Record<
  ActivityCategory,
  { label: string; icon: LucideIcon; dot: string; text: string }
> = {
  task: {
    label: "Tasks",
    icon: CheckSquare,
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  project: {
    label: "Projects",
    icon: FolderKanban,
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
  },
  sprint: {
    label: "Sprints",
    icon: Milestone,
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  comment: {
    label: "Comments",
    icon: MessageSquare,
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  assignment: {
    label: "Assignments",
    icon: UserPlus,
    dot: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  reaction: {
    label: "Reactions",
    icon: Smile,
    dot: "bg-pink-500",
    text: "text-pink-600 dark:text-pink-400",
  },
  time: {
    label: "Time logged",
    icon: Clock,
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
  other: {
    label: "Other",
    icon: Activity,
    dot: "bg-slate-400",
    text: "text-slate-500 dark:text-slate-400",
  },
};

/**
 * The entity name in an activity line, e.g. the `"…"` in
 * `Daniel created task "Project kickoff"`.
 *
 * Stripped before categorising, because otherwise the user's own wording drives
 * the classification: a task called "Project kickoff" filed under Projects, one
 * called "Sprint planning" under Sprints, a sprint called "Comment triage"
 * under Comments. Every summary this app writes puts the category word in the
 * verb phrase (`created task`, `marked project … as Active`), so the quotes
 * carry no signal worth keeping — only noise. Typographic quotes are covered
 * too, in case a summary ever uses them.
 */
const QUOTED = /["“”‘’][^"“”‘’]*["“”‘’]/g;

/**
 * The " · Project Name" scope that `withProjectScope` appends to task,
 * comment and time entries.
 *
 * Unquoted, so stripping quotes alone was not enough: a task created in a
 * project called "Comment Co" filed under Comments, and one in "Sprint
 * Ventures" under Sprints. No summary this app writes contains " · "
 * itself, so taking everything from the last one is safe.
 */
const PROJECT_SCOPE = / · [^·]*$/;

/** Map an activity log line to a category. Order matters (most specific first). */
export function categorizeActivity(text: string): ActivityCategory {
  const t = text.replace(PROJECT_SCOPE, " ").replace(QUOTED, " ").toLowerCase();
  if (t.includes("reacted")) return "reaction";
  if (t.includes("comment") || t.includes("replied")) return "comment";
  if (t.includes("logged time")) return "time";
  if (t.includes("assigned") || t.includes("assignee")) return "assignment";
  if (t.includes("sprint")) return "sprint";
  if (t.includes("project")) return "project";
  if (
    t.includes("task") ||
    t.includes("moved") ||
    t.includes("status")
  )
    return "task";
  return "other";
}
