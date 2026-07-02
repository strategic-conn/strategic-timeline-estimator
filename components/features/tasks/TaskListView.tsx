"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronRight,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTeamMembers } from "@/store/team-store";
import type { TeamMember } from "@/types/task.types";
import { cn } from "@/lib/utils";
import { formatWorkHours } from "@/lib/utils/work-hours";
import type { Task, TaskStatus } from "@/types/task.types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/task.types";

const PRIORITY_DOT_BG: Record<Task["priority"], string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-red-500",
};

const STATUS_META = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s])
) as Record<TaskStatus, (typeof TASK_STATUSES)[number]>;

function calendarYmd(d: Date): number {
  return (
    d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate()
  );
}

function dueDateTone(
  dueIso?: string
): "default" | "today" | "overdue" | "none" {
  if (!dueIso) return "none";
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return "none";
  const dueY = calendarYmd(due);
  const todayY = calendarYmd(new Date());
  if (dueY < todayY) return "overdue";
  if (dueY === todayY) return "today";
  return "default";
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** Narrow label for mobile metadata row */
function formatDueCompact(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

export interface TaskListViewProps {
  tasks: Task[];
  highlightTaskId?: string | null;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskAssign: (taskId: string, userId: string | null) => void;
}

function TaskListView({
  tasks,
  highlightTaskId,
  selectedTaskIds,
  onToggleSelect,
  onTaskClick,
  onTaskDelete,
  onTaskStatusChange,
  onTaskAssign,
}: TaskListViewProps) {
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    Set<TaskStatus>
  >(() => new Set());

  React.useEffect(() => {
    if (!highlightTaskId) return;
    const task = tasks.find((t) => t.id === highlightTaskId);
    if (!task) return;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.delete(task.status);
      return next;
    });
  }, [highlightTaskId, tasks]);

  const grouped = React.useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const s of TASK_STATUSES.map((x) => x.value)) {
      map.set(s, []);
    }
    for (const t of tasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks]);

  const toggleGroup = (status: TaskStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
        role="status"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ListFilter className="size-6" aria-hidden />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          No tasks match your filters
        </p>
      </div>
    );
  }

  const visibleStatuses = TASK_STATUSES.filter(
    (s) => (grouped.get(s.value)?.length ?? 0) > 0
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <div className="min-w-3xl sm:min-w-208">
            {visibleStatuses.map((statusDef, index) => {
        const status = statusDef.value;
        const groupTasks = grouped.get(status) ?? [];
        const collapsed = collapsedGroups.has(status);
        const meta = STATUS_META[status];

        return (
          <React.Fragment key={status}>
            {index > 0 ? <Separator /> : null}
            <div className="bg-card">
              <Button
                type="button"
                variant="ghost"
                className="flex h-11 w-full items-center justify-start gap-2 rounded-none px-3 text-left font-medium hover:bg-muted/60"
                onClick={() => toggleGroup(status)}
                aria-expanded={!collapsed}
              >
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    !collapsed && "rotate-90"
                  )}
                  aria-hidden
                />
                <Badge
                  className={cn(
                    "shrink-0 border-0 font-medium",
                    meta.color
                  )}
                >
                  {meta.label}
                </Badge>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {groupTasks.length}{" "}
                  {groupTasks.length === 1 ? "task" : "tasks"}
                </span>
              </Button>

              {!collapsed && (
                <ul className="m-0 list-none p-0">
                  {groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTaskIds.has(task.id)}
                      showLinkSpotlight={task.id === highlightTaskId}
                      onToggleSelect={onToggleSelect}
                      onTaskClick={onTaskClick}
                      onTaskDelete={onTaskDelete}
                      onTaskStatusChange={onTaskStatusChange}
                      onTaskAssign={onTaskAssign}
                    />
                  ))}
                </ul>
              )}
            </div>
          </React.Fragment>
        );
      })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface TaskRowProps {
  task: Task;
  selected: boolean;
  showLinkSpotlight?: boolean;
  onToggleSelect: (taskId: string) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskAssign: (taskId: string, userId: string | null) => void;
}

function TaskRow({
  task,
  selected,
  showLinkSpotlight = false,
  onToggleSelect,
  onTaskClick,
  onTaskDelete,
  onTaskStatusChange,
  onTaskAssign,
}: TaskRowProps) {
  const teamMembers = useTeamMembers();
  const memberById = React.useMemo(
    () => new Map(teamMembers.map((m) => [m.id, m])),
    [teamMembers]
  );
  const assignees = task.assignee_ids
    .map((id) => memberById.get(id))
    .filter(Boolean) as TeamMember[];
  const tone = dueDateTone(task.due_date);
  const statusMeta = STATUS_META[task.status];
  const tags = task.tags.slice(0, 2);

  const priorityLabel =
    TASK_PRIORITIES.find((p) => p.value === task.priority)?.label ?? "Priority";

  return (
    <li
      id={`task-focus-${task.id}`}
      className={cn(
        "border-t border-border/80 transition-colors hover:bg-muted/50",
        showLinkSpotlight && "task-link-spotlight rounded-md bg-amber-500/10"
      )}
    >
      <div className="flex min-w-0 gap-3 px-3 py-2.5">
        <div
          className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5 sm:flex-row sm:items-center sm:gap-2 sm:pt-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(task.id)}
            aria-label={`Select ${task.title}`}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-block size-2 shrink-0 rounded-full",
                  PRIORITY_DOT_BG[task.priority]
                )}
                aria-hidden
              />
            </TooltipTrigger>
            <TooltipContent side="right">{priorityLabel}</TooltipContent>
          </Tooltip>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-start sm:gap-3">
            <button
              type="button"
              className="w-full min-w-0 max-w-full text-left text-[0.9375rem] leading-snug font-medium wrap-break-word text-foreground underline-offset-4 hover:underline sm:min-w-48 sm:max-w-md sm:shrink sm:flex-1 sm:text-sm sm:leading-normal"
              title={task.title}
              onClick={() => onTaskClick(task.id)}
            >
              {task.title}
            </button>

            <div className="flex shrink-0 flex-nowrap items-center gap-x-2 gap-y-1 sm:gap-2">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={
                      assignees.length
                        ? `Assignees (${assignees.map((a) => a.name).join(", ")})`
                        : "Assign task"
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center">
                      {assignees.length === 0 ? (
                        <Avatar size="sm" className="size-6">
                          <AvatarFallback className="text-[10px] text-muted-foreground">
                            ?
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="flex -space-x-1.5">
                          {assignees.slice(0, 3).map((m) => (
                            <Avatar
                              key={m.id}
                              size="sm"
                              className="size-6 ring-2 ring-background"
                            >
                              <AvatarImage src={m.avatar_url} alt="" />
                              <AvatarFallback
                                className="text-[10px] font-medium text-white"
                                style={{ backgroundColor: m.avatarColor }}
                              >
                                {m.initials}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {assignees.length > 3 ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              +{assignees.length - 3}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {assignees.length
                  ? `Assignees: ${assignees.map((a) => a.name).join(", ")}`
                  : "Assign people"}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Assignees</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => onTaskAssign(task.id, null)}
              >
                Clear all
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {teamMembers.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.id}
                  checked={task.assignee_ids.includes(m.id)}
                  onCheckedChange={() => onTaskAssign(task.id, m.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate">{m.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden items-center gap-1 sm:flex">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex min-w-0 items-center gap-1 text-muted-foreground sm:min-w-28",
                  "text-[0.7rem] tabular-nums sm:text-xs",
                  tone === "overdue" && "font-medium text-red-600 dark:text-red-400",
                  tone === "today" && "font-medium text-amber-600 dark:text-amber-400"
                )}
              >
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                <span className="sm:hidden">{formatDueCompact(task.due_date)}</span>
                <span className="hidden sm:inline">
                  {formatShortDate(task.due_date)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              Due {task.due_date ? formatShortDate(task.due_date) : "not set"}
            </TooltipContent>
          </Tooltip>

          <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
            {task.estimated_hours != null
              ? `${formatWorkHours(task.estimated_hours)}h`
              : "—"}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-7 shrink-0 gap-1 whitespace-nowrap px-2 font-normal",
                  statusMeta.color
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {statusMeta.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {TASK_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  onSelect={() =>
                    onTaskStatusChange(task.id, s.value)
                  }
                >
                  <span className={cn("rounded px-1.5 py-0.5 text-xs", s.color)}>
                    {s.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground"
                    aria-label={`Actions for ${task.title}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">More actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={() => onTaskClick(task.id)}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onTaskDelete(task.id)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 pb-2.5 sm:hidden">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export { TaskListView };
