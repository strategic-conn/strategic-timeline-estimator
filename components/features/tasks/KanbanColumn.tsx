"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Inbox, Plus } from "lucide-react";
import * as React from "react";

import { TaskCard } from "@/components/features/tasks/TaskCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types/task.types";
import { TASK_STATUSES } from "@/types/task.types";

export interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  highlightTaskId?: string | null;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskAssign: (taskId: string, userId: string | null) => void;
  /** Opens the full create-task dialog with this column's status pre-selected. */
  onRequestCreateTask: (status: TaskStatus) => void;
}

function formatHours(total: number): string {
  if (total === 0) return "0h";
  const rounded = Math.round(total * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

export function KanbanColumn({
  status,
  tasks,
  highlightTaskId,
  selectedTaskIds,
  onToggleSelect,
  onTaskClick,
  onTaskDelete,
  onTaskStatusChange,
  onTaskAssign,
  onRequestCreateTask,
}: KanbanColumnProps) {
  const statusMeta = TASK_STATUSES.find((s) => s.value === status);
  const label = statusMeta?.label ?? status;
  const statusColor = statusMeta?.color ?? "";

  const { isOver, setNodeRef } = useDroppable({ id: status });

  const taskIds = React.useMemo(() => tasks.map((t) => t.id), [tasks]);
  const totalEstimatedHours = tasks.reduce(
    (sum, t) => sum + (t.estimated_hours ?? 0),
    0
  );

  return (
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-none flex-col rounded-xl border border-border/60 bg-muted/25 shadow-sm shadow-primary/[0.03]">
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-2 rounded-t-[inherit] border-b px-3 py-2.5",
          statusColor
        )}
      >
        <Badge
          className={cn(
            "h-6 border-transparent px-2 text-xs font-semibold shadow-none",
            statusColor
          )}
        >
          {label}
        </Badge>
        <div className="ml-auto flex items-center gap-2 text-xs font-medium tabular-nums opacity-90">
          <span>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
          <span className="opacity-60" aria-hidden>
            ·
          </span>
          <span title="Sum of estimated hours">{formatHours(totalEstimatedHours)}</span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col transition-colors",
          isOver && "bg-primary/5 ring-1 ring-inset ring-primary/25"
        )}
      >
        <div className="min-h-[120px] flex-1 overflow-y-auto p-2 pb-1 [scrollbar-gutter:stable]">
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.length === 0 ? (
              <div
                className={cn(
                  "flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/35 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground",
                  isOver && "border-primary/40 bg-primary/5 text-foreground"
                )}
              >
                <Inbox className="size-8 shrink-0 opacity-50" aria-hidden />
                <p className="font-medium">Drop tasks here</p>
              </div>
            ) : (
              <ul className="flex list-none flex-col gap-2" role="list">
                {tasks.map((task) => (
                  <li key={task.id} className="min-w-0">
                    <TaskCard
                      task={task}
                      isSelected={selectedTaskIds.has(task.id)}
                      showLinkSpotlight={task.id === highlightTaskId}
                      onToggleSelect={onToggleSelect}
                      onClick={onTaskClick}
                      onDelete={onTaskDelete}
                      onStatusChange={onTaskStatusChange}
                      onAssign={onTaskAssign}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SortableContext>
        </div>
      </div>

      <div className="shrink-0 border-t bg-muted/20 px-2 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => onRequestCreateTask(status)}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          Add task
        </Button>
      </div>
    </div>
  );
}
