import type { Task } from "@/types/task.types";

/** People who care about a task: its assignees + the reporter (deduped). */
export function taskRecipients(task: Pick<Task, "assignee_ids" | "reporter_id">): string[] {
  return [...new Set([...task.assignee_ids, task.reporter_id])].filter(Boolean);
}

/** Task participants plus anyone @-mentioned (for comment/reply notifications). */
export function commentRecipients(
  task: Pick<Task, "assignee_ids" | "reporter_id">,
  mentionIds: string[] = [],
): string[] {
  return [...new Set([...taskRecipients(task), ...mentionIds])].filter(Boolean);
}
