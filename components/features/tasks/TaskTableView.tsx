"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ListX,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { cn } from "@/lib/utils";
import { formatWorkHours } from "@/lib/utils/work-hours";
import type { Task, TaskPriority, TaskStatus } from "@/types/task.types";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/task.types";

const MEMBER_BY_ID = new Map(TEAM_MEMBERS.map((m) => [m.id, m]));

const STATUS_META = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s])
) as Record<TaskStatus, (typeof TASK_STATUSES)[number]>;

const STATUS_SORT_INDEX = Object.fromEntries(
  TASK_STATUSES.map((s, i) => [s.value, i])
) as Record<TaskStatus, number>;

const PRIORITY_SORT_INDEX: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const PRIORITY_DOT_BG: Record<TaskPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-red-500",
};

type TaskTableSortColumn =
  | "title"
  | "status"
  | "priority"
  | "assignee"
  | "tags"
  | "due_date"
  | "estimated_hours"
  | "logged_hours"
  | "reporter"
  | "created_at";

export interface TaskTableViewProps {
  tasks: Task[];
  highlightTaskId?: string | null;
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onSelectAll: (selected: boolean) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskAssign: (taskId: string, userId: number | null) => void;
}

function calendarYmd(d: Date): number {
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function dueDateTone(dueIso?: string): "default" | "today" | "overdue" | "none" {
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

function assigneeSortKey(task: Task): string {
  if (!task.assignee_ids.length) return "\uffff";
  return [...task.assignee_ids]
    .map((id) => MEMBER_BY_ID.get(id)?.name ?? "")
    .sort()
    .join(",")
    .toLowerCase();
}

function reporterSortKey(task: Task): string {
  return (MEMBER_BY_ID.get(task.reporter_id)?.name ?? "").toLowerCase();
}

function compareTasks(
  a: Task,
  b: Task,
  column: TaskTableSortColumn,
  dir: "asc" | "desc"
): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;

  switch (column) {
    case "title":
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      break;
    case "status":
      cmp = STATUS_SORT_INDEX[a.status] - STATUS_SORT_INDEX[b.status];
      break;
    case "priority":
      cmp = PRIORITY_SORT_INDEX[a.priority] - PRIORITY_SORT_INDEX[b.priority];
      break;
    case "assignee":
      cmp = assigneeSortKey(a).localeCompare(assigneeSortKey(b));
      break;
    case "tags":
      cmp = [...a.tags].sort().join(",").localeCompare([...b.tags].sort().join(","));
      break;
    case "due_date": {
      const ta = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      cmp = ta - tb;
      break;
    }
    case "estimated_hours":
      cmp = (a.estimated_hours ?? -1) - (b.estimated_hours ?? -1);
      break;
    case "logged_hours":
      cmp = (a.logged_hours ?? -1) - (b.logged_hours ?? -1);
      break;
    case "reporter":
      cmp = reporterSortKey(a).localeCompare(reporterSortKey(b));
      break;
    case "created_at":
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      break;
    default:
      cmp = 0;
  }

  if (cmp !== 0) return sign * cmp;
  return a.id.localeCompare(b.id);
}

function SortHeaderIcon({
  column,
  activeColumn,
  direction,
}: {
  column: TaskTableSortColumn;
  activeColumn: TaskTableSortColumn | null;
  direction: "asc" | "desc";
}) {
  if (activeColumn !== column) {
    return <ArrowUpDown className="size-3.5 text-muted-foreground opacity-60" aria-hidden />;
  }
  return direction === "asc" ? (
    <ArrowUp className="size-3.5 text-foreground" aria-hidden />
  ) : (
    <ArrowDown className="size-3.5 text-foreground" aria-hidden />
  );
}

function TaskTableView({
  tasks,
  highlightTaskId,
  selectedTaskIds,
  onToggleSelect,
  onSelectAll,
  onTaskClick,
  onTaskDelete,
  onTaskStatusChange,
  onTaskAssign,
}: TaskTableViewProps) {
  const [sort, setSort] = React.useState<{
    column: TaskTableSortColumn | null;
    direction: "asc" | "desc";
  }>({ column: null, direction: "asc" });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<10 | 25 | 50>(10);

  const sortColumn = sort.column;
  const sortDirection = sort.direction;

  const toggleSort = React.useCallback((column: TaskTableSortColumn) => {
    setSort((s) =>
      s.column !== column
        ? { column, direction: "asc" }
        : { column, direction: s.direction === "asc" ? "desc" : "asc" }
    );
  }, []);

  const sortedTasks = React.useMemo(() => {
    if (!sortColumn) return tasks;
    return [...tasks].sort((a, b) => compareTasks(a, b, sortColumn, sortDirection));
  }, [tasks, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const safePage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  React.useEffect(() => {
    if (!highlightTaskId) return;
    const idx = sortedTasks.findIndex((t) => t.id === highlightTaskId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    setPage(targetPage);
  }, [highlightTaskId, sortedTasks, pageSize]);

  const paginatedTasks = React.useMemo(
    () => sortedTasks.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedTasks, safePage, pageSize]
  );

  const allPageSelected =
    paginatedTasks.length > 0 && paginatedTasks.every((t) => selectedTaskIds.has(t.id));
  const somePageSelected = paginatedTasks.some((t) => selectedTaskIds.has(t.id));
  const headerCheckboxState: boolean | "indeterminate" = allPageSelected
    ? true
    : somePageSelected
      ? "indeterminate"
      : false;

  const handleHeaderSelect = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        for (const t of paginatedTasks) {
          if (!selectedTaskIds.has(t.id)) onToggleSelect(t.id);
        }
      } else {
        for (const t of paginatedTasks) {
          if (selectedTaskIds.has(t.id)) onToggleSelect(t.id);
        }
      }
      onSelectAll(checked);
    },
    [paginatedTasks, selectedTaskIds, onToggleSelect, onSelectAll]
  );

  const sortableHead = (
    column: TaskTableSortColumn,
    label: string,
    className?: string
  ) => (
    <TableHead className={cn("p-2", className)}>
      <button
        type="button"
        className={cn(
          "-mx-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-left font-medium hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        )}
        onClick={() => toggleSort(column)}
      >
        {label}
        <SortHeaderIcon
          column={column}
          activeColumn={sortColumn}
          direction={sortDirection}
        />
      </button>
    </TableHead>
  );

  if (tasks.length === 0) {
    return (
      <div
        className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <ListX className="size-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">No tasks found</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Try adjusting filters or create a new task to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[min(70vh,640px)] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-background/95 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80 [&_tr]:border-b">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-20 w-10 bg-background/95 p-2 backdrop-blur supports-backdrop-filter:bg-background/80">
                <Checkbox
                  checked={headerCheckboxState}
                  onCheckedChange={(v) => {
                    if (v === "indeterminate") return;
                    handleHeaderSelect(v === true);
                  }}
                  aria-label="Select all tasks on this page"
                />
              </TableHead>
              <TableHead className="sticky top-0 z-20 w-10 bg-background/95 p-2 text-center text-xs font-medium text-muted-foreground backdrop-blur supports-backdrop-filter:bg-background/80">
                #
              </TableHead>
              {sortableHead("title", "Title", "sticky top-0 z-20 min-w-[200px] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("status", "Status", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("priority", "Priority", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("assignee", "Assignees", "sticky top-0 z-20 min-w-[140px] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("tags", "Tags", "sticky top-0 z-20 min-w-[120px] max-w-[200px] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("due_date", "Due Date", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("estimated_hours", "Est. Hours", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("logged_hours", "Logged Hours", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("reporter", "Reporter", "sticky top-0 z-20 min-w-[140px] bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              {sortableHead("created_at", "Created", "sticky top-0 z-20 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80")}
              <TableHead className="sticky top-0 z-20 w-12 bg-background/95 p-2 text-right backdrop-blur supports-backdrop-filter:bg-background/80">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTasks.map((task, index) => {
              const rowNum = (safePage - 1) * pageSize + index + 1;
              const statusMeta = STATUS_META[task.status];
              const priorityMeta = TASK_PRIORITIES.find((p) => p.value === task.priority);
              const assignees = task.assignee_ids
                .map((id) => MEMBER_BY_ID.get(id))
                .filter(Boolean) as (typeof TEAM_MEMBERS)[number][];
              const reporter = MEMBER_BY_ID.get(task.reporter_id);
              const dueTone = dueDateTone(task.due_date);

              return (
                <TableRow
                  key={task.id}
                  id={`task-focus-${task.id}`}
                  data-state={selectedTaskIds.has(task.id) ? "selected" : undefined}
                  className={cn(
                    "text-xs",
                    task.id === highlightTaskId && "task-link-spotlight bg-amber-500/10"
                  )}
                >
                  <TableCell className="p-2">
                    <Checkbox
                      checked={selectedTaskIds.has(task.id)}
                      onCheckedChange={() => onToggleSelect(task.id)}
                      aria-label={`Select task ${task.title}`}
                    />
                  </TableCell>
                  <TableCell className="p-2 text-center tabular-nums text-muted-foreground">
                    {rowNum}
                  </TableCell>
                  <TableCell className="max-w-[240px] p-2">
                    <button
                      type="button"
                      className="line-clamp-2 w-full text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => onTaskClick(task.id)}
                    >
                      {task.title}
                    </button>
                  </TableCell>
                  <TableCell className="p-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex max-w-full items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-6 max-w-full cursor-pointer truncate border-0 px-2 text-xs font-medium",
                              statusMeta.color
                            )}
                          >
                            {statusMeta.label}
                          </Badge>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-44">
                        <DropdownMenuLabel>Change status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {TASK_STATUSES.map((s) => (
                          <DropdownMenuItem
                            key={s.value}
                            onClick={() => onTaskStatusChange(task.id, s.value)}
                          >
                            <span
                              className={cn(
                                "mr-2 size-2 shrink-0 rounded-full",
                                s.value === "todo" && "bg-slate-400",
                                s.value === "in_progress" && "bg-blue-500",
                                s.value === "in_review" && "bg-purple-500",
                                s.value === "done" && "bg-green-500",
                                s.value === "blocked" && "bg-red-500"
                              )}
                            />
                            {s.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT_BG[task.priority])}
                        aria-hidden
                      />
                      <span className={cn("truncate", priorityMeta?.color)}>
                        {priorityMeta?.label ?? task.priority}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="p-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex max-w-[200px] items-center gap-2 rounded-md py-0.5 pr-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {assignees.length === 0 ? (
                            <span className="text-muted-foreground">Unassigned</span>
                          ) : (
                            <>
                              <div className="flex -space-x-1.5 shrink-0">
                                {assignees.slice(0, 3).map((a) => (
                                  <Avatar
                                    key={a.id}
                                    size="sm"
                                    className="size-6 ring-2 ring-background"
                                  >
                                    <AvatarImage src={a.avatar_url} alt="" />
                                    <AvatarFallback
                                      className="text-[10px]"
                                      style={{ backgroundColor: `${a.avatarColor}33` }}
                                    >
                                      {a.initials}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                              <span className="truncate text-xs">
                                {assignees.map((a) => a.name).join(", ")}
                              </span>
                            </>
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Assignees</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onTaskAssign(task.id, null)}>
                          Clear all
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {TEAM_MEMBERS.map((m) => (
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
                  </TableCell>
                  <TableCell className="max-w-[200px] p-2">
                    {task.tags.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="line-clamp-2 whitespace-normal text-muted-foreground">
                        {task.tags.join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 tabular-nums",
                        dueTone === "overdue" && "font-medium text-red-600 dark:text-red-400",
                        dueTone === "today" && "font-medium text-amber-600 dark:text-amber-400",
                        dueTone === "none" && "text-muted-foreground",
                        dueTone === "default" && "text-foreground"
                      )}
                    >
                      <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {formatShortDate(task.due_date)}
                    </span>
                  </TableCell>
                  <TableCell className="p-2 tabular-nums">
                    {formatWorkHours(task.estimated_hours)}
                  </TableCell>
                  <TableCell className="p-2 tabular-nums">
                    {formatWorkHours(task.logged_hours)}
                  </TableCell>
                  <TableCell className="p-2">
                    {reporter ? (
                      <div className="flex max-w-[160px] items-center gap-2">
                        <Avatar size="sm">
                          <AvatarImage src={reporter.avatar_url} alt="" />
                          <AvatarFallback
                            className="text-[10px]"
                            style={{ backgroundColor: `${reporter.avatarColor}33` }}
                          >
                            {reporter.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{reporter.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="p-2 tabular-nums text-muted-foreground">
                    {formatShortDate(task.created_at)}
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" className="size-7" aria-label={`Actions for ${task.title}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onTaskClick(task.id)}>
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => onTaskDelete(task.id)}>
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {sortedTasks.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, sortedTasks.length)}
          </span>{" "}
          of <span className="font-medium text-foreground">{sortedTasks.length}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2.5"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-md px-2.5"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const next = Number(v) as 10 | 25 | 50;
                setPageSize(next);
                setPage(1);
              }}
            >
              <SelectTrigger size="sm" className="h-7 w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TaskTableView };
