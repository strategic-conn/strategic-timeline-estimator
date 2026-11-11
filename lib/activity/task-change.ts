import { format, isValid, parseISO } from "date-fns";

import type { Task } from "@/types/task.types";

type Scheduled = Pick<Task, "due_date" | "estimated_hours" | "sprint_id">;

const day = (d?: string | null) => {
  if (!d) return "no date";
  const p = parseISO(d); // a DATE column: parse as a local day (rule 8)
  return isValid(p) ? format(p, "MMM d") : d;
};

/**
 * What moved on a task, in words, for the people working on it — the due
 * date, the estimate, the sprint. `null` when none of those changed (a rename
 * or a status change isn't a schedule change). Pure.
 *
 *   "due Dec 1 → Dec 5 · 8 h → 12 h · moved to another sprint"
 */
export function describeTaskChange(before: Scheduled, after: Scheduled): string | null {
  const parts: string[] = [];
  if ((before.due_date ?? null) !== (after.due_date ?? null)) {
    parts.push(`due ${day(before.due_date)} → ${day(after.due_date)}`);
  }
  if ((before.estimated_hours ?? null) !== (after.estimated_hours ?? null)) {
    parts.push(`${before.estimated_hours ?? 0} h → ${after.estimated_hours ?? 0} h`);
  }
  if ((before.sprint_id ?? null) !== (after.sprint_id ?? null)) {
    parts.push(
      !after.sprint_id
        ? "moved to the backlog"
        : !before.sprint_id
          ? "added to a sprint"
          : "moved to another sprint",
    );
  }
  return parts.length ? parts.join(" · ") : null;
}
