"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task.types";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskStatus,
} from "@/types/task.types";

export interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  /** Subtle glow when user arrived via ?task= deep link */
  showLinkSpotlight?: boolean;
  onToggleSelect: (taskId: string) => void;
  onClick: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAssign: (taskId: string, userId: number | null) => void;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dueDateTone(
  dueDateStr: string | undefined
): "none" | "overdue" | "today" | "upcoming" {
  if (!dueDateStr) return "none";
  const due = startOfDay(new Date(dueDateStr));
  const today = startOfDay(new Date());
  const diff = due.getTime() - today.getTime();
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "upcoming";
}

function formatDueDate(dueDateStr: string): string {
  return new Date(dueDateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function commentCount(task: Task): number {
  return task.comments.length;
}

const STATUS_MENU_DOT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

export function TaskCard({
  task,
  isSelected,
  showLinkSpotlight = false,
  onToggleSelect,
  onClick,
  onDelete,
  onStatusChange,
  onAssign,
}: TaskCardProps) {
  const [assignOpen, setAssignOpen] = React.useState(false);

  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const priorityBorder =
    TASK_PRIORITIES.find((p) => p.value === task.priority)?.border ??
    "border-l-slate-400";

  const assignees = task.assignee_ids
    .map((id) => TEAM_MEMBERS.find((m) => m.id === id))
    .filter(Boolean) as (typeof TEAM_MEMBERS)[number][];

  const dueTone = dueDateTone(task.due_date);

  const estimated = task.estimated_hours;
  const logged = task.logged_hours ?? 0;
  const progressPct =
    estimated != null && estimated > 0
      ? Math.min(100, (logged / estimated) * 100)
      : 0;
  const progressComplete =
    estimated != null && estimated > 0 && logged >= estimated;

  const visibleTags = task.tags.slice(0, 2);
  const extraTagCount = Math.max(0, task.tags.length - 2);

  return (
    <TooltipProvider delayDuration={400}>
      <div
        id={`task-focus-${task.id}`}
        ref={setNodeRef}
        style={style}
        className={cn(
          "group relative rounded-lg border bg-card shadow-sm border-l-4",
          priorityBorder,
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          showLinkSpotlight && "task-link-spotlight"
        )}
        {...attributes}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1.5 z-10 flex items-start justify-between px-1.5">
          <div className="pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                  aria-label="Drag to reorder"
                  {...listeners}
                >
                  <GripVertical className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Drag to reorder</TooltipContent>
            </Tooltip>
          </div>
          <div className="pointer-events-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <div
              className="flex items-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(task.id)}
                aria-label={`Select task ${task.title}`}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-muted-foreground"
                  aria-label="Task actions"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onSelect={() => onClick(task.id)}
                  className="gap-2"
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(task.id)}
                  className="gap-2"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    {TASK_STATUSES.map((s) => (
                      <DropdownMenuItem
                        key={s.value}
                        onSelect={() => onStatusChange(task.id, s.value)}
                        className="gap-2"
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            STATUS_MENU_DOT[s.value]
                          )}
                        />
                        {s.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-2 px-3 pb-3 pt-9">
          <button
            type="button"
            className="w-full cursor-pointer space-y-2 rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onClick(task.id)}
          >
            <h3 className="line-clamp-2 pr-1 font-medium leading-snug">
              {task.title}
            </h3>

            {task.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {visibleTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] font-normal"
                  >
                    {tag}
                  </Badge>
                ))}
                {extraTagCount > 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    +{extraTagCount}
                  </span>
                ) : null}
              </div>
            ) : null}

            {task.due_date ? (
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  dueTone === "overdue" &&
                    "font-medium text-red-600 dark:text-red-400",
                  dueTone === "today" &&
                    "font-medium text-amber-600 dark:text-amber-400",
                  dueTone === "upcoming" && "text-muted-foreground"
                )}
              >
                <CalendarDays className="size-3.5 shrink-0" />
                <span>{formatDueDate(task.due_date)}</span>
              </div>
            ) : null}

            {estimated != null ? (
              <div className="space-y-1">
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      progressComplete ? "bg-green-500" : "bg-blue-500"
                    )}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </button>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={
                    assignees.length
                      ? `Assignees: ${assignees.map((a) => a.name).join(", ")}`
                      : "Assign members"
                  }
                >
                  {assignees.length === 0 ? (
                    <Avatar className="size-7">
                      <AvatarFallback
                        className="text-[10px] font-medium text-primary-foreground"
                        style={{ backgroundColor: "var(--muted)" }}
                      >
                        ?
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="flex -space-x-2">
                      {assignees.slice(0, 3).map((a) => (
                        <Avatar
                          key={a.id}
                          className="size-7 ring-2 ring-card"
                        >
                          <AvatarImage src={a.avatar_url} alt={a.name} />
                          <AvatarFallback
                            className="text-[10px] font-medium text-primary-foreground"
                            style={{
                              backgroundColor: a.avatarColor,
                              color: "#fff",
                            }}
                          >
                            {a.initials}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {assignees.length > 3 ? (
                        <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card">
                          +{assignees.length - 3}
                        </div>
                      ) : null}
                    </div>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 p-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">
                  Assignees
                </p>
                <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto px-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 justify-start px-2 font-normal text-muted-foreground"
                    onClick={() => {
                      onAssign(task.id, null);
                      setAssignOpen(false);
                    }}
                  >
                    Clear all
                  </Button>
                  {TEAM_MEMBERS.map((member) => {
                    const checked = task.assignee_ids.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/80"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            onAssign(task.id, member.id);
                          }}
                          aria-label={member.name}
                        />
                        <Avatar className="size-7">
                          <AvatarImage
                            src={member.avatar_url}
                            alt={member.name}
                          />
                          <AvatarFallback
                            className="text-[10px] font-medium text-primary-foreground"
                            style={{
                              backgroundColor: member.avatarColor,
                              color: "#fff",
                            }}
                          >
                            {member.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{member.name}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              className="flex items-center gap-1 rounded-md text-xs text-muted-foreground outline-none ring-offset-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onClick(task.id)}
            >
              <MessageSquare className="size-3.5" />
              <span>{commentCount(task)}</span>
            </button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
