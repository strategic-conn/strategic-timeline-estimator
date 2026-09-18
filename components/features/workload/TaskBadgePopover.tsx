"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import { TASK_STATUS_DOT } from "@/lib/constants/task-status";
import { cn } from "@/lib/utils";
import { relativeDay } from "@/lib/utils/relative-dates";
import { useProjectsStore } from "@/store/projects-store";
import type { Task } from "@/types/task.types";
import { TASK_STATUSES } from "@/types/task.types";

const LABEL = new Map(TASK_STATUSES.map((s) => [s.value, s.label]));

/** The board this task lives on — its sprint's, or the project's backlog. */
export function taskHref(t: Task): string {
  return t.sprint_id
    ? sprintTasksHref(t.project_id, t.sprint_id, t.id)
    : backlogHref(t.project_id, t.id);
}

/**
 * A count badge that opens the list behind it.
 *
 * "7 pending" and "1 overdue" were dead ends: they told a manager a problem
 * existed and then made them go hunting for which tasks. The number is the
 * question; the list is the answer, and each row links to the task's own board.
 *
 * A `<button>` rather than a hover tooltip on purpose — hover has no equivalent
 * on a phone, and this is a control, not a hint.
 */
export function TaskBadgePopover({
  tasks,
  label,
  tone,
  now,
  emptyHint,
}: {
  tasks: Task[];
  /** e.g. "pending" — rendered as "{n} {label}". */
  label: string;
  tone: "amber" | "destructive";
  now: Date | number;
  /** One line above the list, saying what these are. */
  emptyHint: string;
}) {
  const projects = useProjectsStore((s) => s.projects);
  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? "Project",
    [projects],
  );

  if (tasks.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.6rem] font-medium normal-case transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            tone === "amber"
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/80"
              : "bg-destructive/15 text-destructive hover:bg-destructive/25",
          )}
          aria-label={`${tasks.length} ${label} — show which tasks`}
        >
          {tasks.length} {label}
        </button>
      </PopoverTrigger>
      {/* Narrower than the default and capped in height: at 375px a wider panel
          would overflow the viewport, and a long list has to scroll inside
          rather than push the page. */}
      <PopoverContent
        align="start"
        className="max-h-72 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <p className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {emptyHint}
        </p>
        <ul className="divide-y divide-border/40">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={taskHref(t)}
                className="group flex items-start gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    TASK_STATUS_DOT[t.status],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {t.title}
                  </span>
                  <span className="block truncate text-[0.65rem] text-muted-foreground">
                    {projectName(t.project_id)} · {LABEL.get(t.status) ?? t.status}
                    {t.due_date ? ` · due ${relativeDay(t.due_date, now)}` : ""}
                    {t.estimated_hours ? ` · ${t.estimated_hours}h` : ""}
                  </span>
                </span>
                <ArrowRight
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
