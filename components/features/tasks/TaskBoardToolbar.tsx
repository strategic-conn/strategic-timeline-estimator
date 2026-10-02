"use client";

import * as React from "react";
import {
  Filter,
  LayoutGrid,
  List,
  Plus,
  Search,
  TableProperties,
  Trash2,
  FolderKanban,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTasksStore } from "@/hooks/useTasks";
import { usePermissions } from "@/hooks/usePermissions";
import { TASK_STATUSES, type TaskStatus } from "@/types/task.types";
import { tourAnchor } from "@/lib/tours/ids";
import { AppHelp } from "@/components/common/app-help";

export type BacklogSprintMoveTarget = {
  id: string;
  label: string;
  group: "quick" | "more";
};

export interface TaskBoardToolbarProps {
  boardTitle: string;
  boardSubtitle?: string;
  search: string;
  onSearchChange: (v: string) => void;
  isFiltersOpen: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  selectedCount: number;
  onBulkStatusChange: (status: TaskStatus) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  onCreateTask: () => void;
  /** When set (e.g. on backlog board), bulk bar can move tasks into a sprint. */
  backlogSprintMoveTargets?: BacklogSprintMoveTarget[];
  onBulkMoveToSprint?: (sprintId: string) => void;
}

export function TaskBoardToolbar({
  boardTitle,
  boardSubtitle,
  search,
  onSearchChange,
  isFiltersOpen,
  onToggleFilters,
  activeFilterCount,
  selectedCount,
  onBulkStatusChange,
  onBulkDelete,
  onClearSelection,
  onCreateTask,
  backlogSprintMoveTargets,
  onBulkMoveToSprint,
}: TaskBoardToolbarProps) {
  const activeView = useTasksStore((s) => s.activeView);
  const setActiveView = useTasksStore((s) => s.setActiveView);
  const { canCreateTask, canDeleteTask, canEditTask } = usePermissions();

  return (
    <>
      <div className="flex w-full flex-col gap-4 lg:grid lg:grid-cols-[auto_minmax(14rem,1fr)_auto] lg:items-center lg:gap-6">
        <div className="relative min-w-0 rounded-2xl border border-border/60 bg-card/35 px-4 py-3 shadow-sm backdrop-blur-md sm:pr-11 dark:bg-card/25">
          <AppHelp section="board" corner className="right-2.5 top-2.5" />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground max-sm:pr-8">
            Board
          </p>
          <p className="text-sm font-semibold tracking-tight text-foreground max-sm:pr-8">
            {boardTitle}
          </p>
          {boardSubtitle ? (
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {boardSubtitle}
            </p>
          ) : null}
        </div>

        <div
          className="relative w-full min-w-0 max-w-none justify-self-stretch lg:min-w-56"
          {...tourAnchor("board.search")}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="task-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks..."
            className="h-10 w-full min-w-0 border-border/70 pl-9 sm:h-9"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search tasks"
          />
        </div>

        <TooltipProvider delayDuration={400}>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-3 lg:justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={isFiltersOpen ? "secondary" : "outline"}
                  size="icon"
                  className="relative shrink-0"
                  onClick={onToggleFilters}
                  aria-expanded={isFiltersOpen}
                  {...tourAnchor("board.filters")}
                  aria-label={
                    activeFilterCount > 0
                      ? `Filters, ${activeFilterCount} active`
                      : "Toggle filters"
                  }
                >
                  <Filter />
                  {activeFilterCount > 0 ? (
                    <Badge
                      variant="default"
                      className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] tabular-nums"
                    >
                      {activeFilterCount > 99 ? "99+" : activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {activeFilterCount > 0
                  ? `Filters (${activeFilterCount} active)`
                  : "Show filters"}
              </TooltipContent>
            </Tooltip>

            <div
              data-slot="button-group"
              className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
              role="group"
              aria-label="Task view"
              {...tourAnchor("board.views")}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={activeView === "kanban" ? "secondary" : "ghost"}
                    className="rounded-md"
                    onClick={() => setActiveView("kanban")}
                    aria-pressed={activeView === "kanban"}
                    aria-label="Kanban view"
                  >
                    <LayoutGrid />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Board</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={activeView === "list" ? "secondary" : "ghost"}
                    className="rounded-md"
                    onClick={() => setActiveView("list")}
                    aria-pressed={activeView === "list"}
                    aria-label="List view"
                  >
                    <List />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">List</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={activeView === "table" ? "secondary" : "ghost"}
                    className="rounded-md"
                    onClick={() => setActiveView("table")}
                    aria-pressed={activeView === "table"}
                    aria-label="Table view"
                  >
                    <TableProperties />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Table</TooltipContent>
              </Tooltip>
            </div>

            {canCreateTask && (
              <Button
                type="button"
                onClick={onCreateTask}
                className="shrink-0 gap-1.5"
                {...tourAnchor("board.add-task")}
              >
                <Plus />
                Add Task
              </Button>
            )}
          </div>
        </TooltipProvider>
      </div>

      {selectedCount > 0 ? (
        <div
          className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 border-t border-border bg-card shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] md:bottom-0"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="mx-auto flex max-w-[100vw] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-sm font-medium tabular-nums text-foreground">
              {selectedCount} selected
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Change status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {TASK_STATUSES.map(({ value, label }) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() => onBulkStatusChange(value)}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {backlogSprintMoveTargets &&
              backlogSprintMoveTargets.length > 0 &&
              onBulkMoveToSprint ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      <FolderKanban className="size-4" aria-hidden />
                      Move to sprint
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-[min(320px,50vh)] w-56 overflow-y-auto"
                  >
                    {backlogSprintMoveTargets.some((t) => t.group === "quick") ? (
                      <>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Suggested
                        </DropdownMenuLabel>
                        {backlogSprintMoveTargets
                          .filter((t) => t.group === "quick")
                          .map((t) => (
                            <DropdownMenuItem
                              key={t.id}
                              onSelect={() => onBulkMoveToSprint(t.id)}
                            >
                              {t.label}
                            </DropdownMenuItem>
                          ))}
                        {backlogSprintMoveTargets.some((t) => t.group === "more") ? (
                          <DropdownMenuSeparator />
                        ) : null}
                      </>
                    ) : null}
                    {backlogSprintMoveTargets.some((t) => t.group === "more") ? (
                      <>
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          All open sprints
                        </DropdownMenuLabel>
                        {backlogSprintMoveTargets
                          .filter((t) => t.group === "more")
                          .map((t) => (
                            <DropdownMenuItem
                              key={t.id}
                              onSelect={() => onBulkMoveToSprint(t.id)}
                            >
                              {t.label}
                            </DropdownMenuItem>
                          ))}
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {canDeleteTask && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={onBulkDelete}
                >
                  <Trash2 />
                  Delete
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
