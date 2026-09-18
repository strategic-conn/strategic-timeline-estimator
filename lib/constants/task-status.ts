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
