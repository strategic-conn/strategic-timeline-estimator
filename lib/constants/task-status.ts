import type { TaskStatus } from "@/types/task.types";

/**
 * The colour a task status is drawn in, as a solid fill.
 *
 * One definition, because three surfaces had grown byte-identical copies of it
 * (the task card's status menu, the calendar's day dots) and a fourth was about
 * to be written for the workload bar. A status that is purple on one page and
 * blue on another is a status nobody trusts.
 *
 * ⚠️ `GanttClient` keeps its OWN map on purpose — its bars are large filled
 * areas and use tuned opacities (`bg-blue-600/92 dark:bg-blue-500/88`) so text
 * stays readable on top. Same hues, different alpha for a different job; forcing
 * them to share would make one of the two look wrong.
 */
export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

/**
 * Open statuses in workflow order — what a workload bar is made of.
 *
 * `done` is absent by design: a finished task leaves the workload entirely
 * (`isOpen`), so it can never be a segment.
 */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
] as const;

/**
 * Status → label, and status → the SAME colour as a hex string.
 *
 * ⚠️ `dot` and `hex` sit on one line each, deliberately. A chart is SVG and
 * cannot use a Tailwind class; a DOM element cannot take a raw hex without
 * inline styles. So the colour has to exist twice — and the one thing that must
 * never happen is the two drifting, which is precisely how "blocked" ends up
 * red on the board and purple in a chart. Keeping them adjacent means changing
 * one without the other is a visible omission in review, not a silent bug.
 *
 * The hexes are the sRGB values of the Tailwind classes beside them
 * (slate-400, blue-500, purple-500, green-500, red-500).
 */
export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; hex: string }
> = {
  todo: { label: "To Do", dot: "bg-slate-400", hex: "#94a3b8" },
  in_progress: { label: "In Progress", dot: "bg-blue-500", hex: "#3b82f6" },
  in_review: { label: "In Review", dot: "bg-purple-500", hex: "#a855f7" },
  done: { label: "Done", dot: "bg-green-500", hex: "#22c55e" },
  blocked: { label: "Blocked", dot: "bg-red-500", hex: "#ef4444" },
};

/** Human label for a status. One definition — the dashboard and Reports each had a copy. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: TASK_STATUS_META.todo.label,
  in_progress: TASK_STATUS_META.in_progress.label,
  in_review: TASK_STATUS_META.in_review.label,
  done: TASK_STATUS_META.done.label,
  blocked: TASK_STATUS_META.blocked.label,
};
