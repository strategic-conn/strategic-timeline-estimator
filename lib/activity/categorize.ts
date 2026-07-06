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

/** Map an activity log line to a category. Order matters (most specific first). */
export function categorizeActivity(text: string): ActivityCategory {
  const t = text.toLowerCase();
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
