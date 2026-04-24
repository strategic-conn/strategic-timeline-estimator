"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { KanbanBoard } from "@/components/features/tasks/KanbanBoard";
import { TaskListView } from "@/components/features/tasks/TaskListView";
import { TaskTableView } from "@/components/features/tasks/TaskTableView";
import { TaskBoardToolbar } from "@/components/features/tasks/TaskBoardToolbar";
import { TaskFilters, type TaskFiltersProps } from "@/components/features/tasks/TaskFilters";
import { TaskDetailDrawer } from "@/components/features/tasks/TaskDetailDrawer";
import { CreateTaskModal } from "@/components/features/tasks/CreateTaskModal";
import { EditTaskModal } from "@/components/features/tasks/EditTaskModal";
import { DeleteTaskDialog } from "@/components/features/tasks/DeleteTaskDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTasks, useTasksStore } from "@/hooks/useTasks";
import { TASK_FOCUS_QUERY_PARAM } from "@/lib/constants/task-focus";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { useSprintsStore } from "@/store/sprints-store";
import type { Task, TaskStatus } from "@/types/task.types";
import type { BacklogSprintMoveTarget } from "@/components/features/tasks/TaskBoardToolbar";
import { toast } from "sonner";

const EMPTY_FILTERS: TaskFiltersProps["filters"] = {
  assigneeIds: [],
  priorities: [],
  statuses: [],
  tags: [],
  search: "",
};

export interface TasksPageProps {
  /** Route param — tasks are filtered and created under this project. */
  projectId: string;
  /**
   * When set to a sprint id, tasks are filtered to that sprint.
   * When explicitly `null`, shows backlog tasks (no sprint assigned).
   * When `undefined`, shows all project tasks (legacy fallback).
   */
  sprintId?: string | null;
}

export function TasksPage({ projectId, sprintId }: TasksPageProps) {
  const searchParams = useSearchParams();
  const focusParam = searchParams.get(TASK_FOCUS_QUERY_PARAM);

  const {
    tasks,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    reorderTask,
    addComment,
    editComment,
    deleteComment,
    addReply,
    addReaction,
    assignTask,
    appendLoggedHours,
    bulkUpdateStatus,
    bulkDelete,
  } = useTasks();

  const allSprints = useSprintsStore((s) => s.sprints);

  const activeView = useTasksStore((s) => s.activeView);
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);

  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTaskDefaultStatus, setCreateTaskDefaultStatus] =
    React.useState<TaskStatus>("todo");
  const [editTask, setEditTask] = React.useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Task | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    setSelectedTaskId(null);
    setSelectedIds(new Set());
  }, [projectId, sprintId, setSelectedTaskId]);

  const openProjectSprints = React.useMemo(
    () =>
      allSprints
        .filter(
          (sp) =>
            sp.project_id === projectId &&
            (sp.status === "active" || sp.status === "planning")
        )
        .sort((a, b) => a.position - b.position),
    [allSprints, projectId]
  );

  const activeSprintMeta = React.useMemo(
    () => openProjectSprints.find((s) => s.status === "active"),
    [openProjectSprints]
  );

  const nextPlanningSprint = React.useMemo(() => {
    const planning = openProjectSprints.filter((s) => s.status === "planning");
    if (!planning.length) return undefined;
    return [...planning].sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )[0];
  }, [openProjectSprints]);

  const backlogSprintMoveTargets = React.useMemo((): BacklogSprintMoveTarget[] => {
    if (sprintId !== null) return [];
    const items: BacklogSprintMoveTarget[] = [];
    const seen = new Set<string>();
    if (activeSprintMeta) {
      items.push({
        id: activeSprintMeta.id,
        label: `Active sprint · ${activeSprintMeta.name}`,
        group: "quick",
      });
      seen.add(activeSprintMeta.id);
    }
    if (nextPlanningSprint && !seen.has(nextPlanningSprint.id)) {
      items.push({
        id: nextPlanningSprint.id,
        label: `Next sprint · ${nextPlanningSprint.name}`,
        group: "quick",
      });
      seen.add(nextPlanningSprint.id);
    }
    for (const sp of openProjectSprints) {
      if (!seen.has(sp.id)) {
        items.push({
          id: sp.id,
          label: `${sp.name} (${sp.status})`,
          group: "more",
        });
        seen.add(sp.id);
      }
    }
    return items;
  }, [sprintId, activeSprintMeta, nextPlanningSprint, openProjectSprints]);

  const drawerBacklogSprintOptions = React.useMemo(() => {
    if (sprintId !== null) return [];
    return backlogSprintMoveTargets.map((t) => ({ id: t.id, label: t.label }));
  }, [sprintId, backlogSprintMoveTargets]);

  const currentSprintMeta = React.useMemo(
    () =>
      typeof sprintId === "string"
        ? allSprints.find((s) => s.id === sprintId)
        : undefined,
    [allSprints, sprintId]
  );

  const boardTitle = React.useMemo(() => {
    if (sprintId === null) return "Backlog";
    if (currentSprintMeta) return currentSprintMeta.name;
    if (sprintId === undefined) return "All tasks";
    return "Tasks";
  }, [sprintId, currentSprintMeta]);

  const boardSubtitle = React.useMemo(() => {
    if (sprintId === null) {
      return "Unscheduled work — move items into a sprint when you commit to them";
    }
    if (currentSprintMeta) {
      const a = new Date(currentSprintMeta.start_date).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" }
      );
      const b = new Date(currentSprintMeta.end_date).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric" }
      );
      return `${a} – ${b}`;
    }
    if (sprintId === undefined) return "Every task in this project";
    return undefined;
  }, [sprintId, currentSprintMeta]);

  const filteredTasks = React.useMemo(() => {
    let result = tasks.filter((t) => t.project_id === projectId);

    if (sprintId !== undefined) {
      result =
        sprintId === null
          ? result.filter((t) => !t.sprint_id)
          : result.filter((t) => t.sprint_id === sprintId);
    }

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.assignee_ids.some((id) =>
            TEAM_MEMBERS.find((m) => m.id === id)?.name.toLowerCase().includes(q)
          )
      );
    }

    if (filters.assigneeIds.length > 0) {
      result = result.filter((t) =>
        filters.assigneeIds.some((fid) => t.assignee_ids.includes(fid))
      );
    }

    if (filters.priorities.length > 0) {
      result = result.filter((t) => filters.priorities.includes(t.priority));
    }

    if (filters.statuses.length > 0) {
      result = result.filter((t) => filters.statuses.includes(t.status));
    }

    if (filters.tags.length > 0) {
      result = result.filter((t) =>
        filters.tags.some((ft) => t.tags.includes(ft))
      );
    }

    return result;
  }, [tasks, filters, projectId, sprintId]);

  const highlightTaskId = React.useMemo(() => {
    if (!focusParam) return null;
    return filteredTasks.some((t) => t.id === focusParam) ? focusParam : null;
  }, [focusParam, filteredTasks]);

  const appliedFocusFromUrl = React.useRef<string | null>(null);

  React.useEffect(() => {
    appliedFocusFromUrl.current = null;
  }, [projectId, sprintId]);

  React.useEffect(() => {
    if (!focusParam) {
      appliedFocusFromUrl.current = null;
      return;
    }
    if (loading) return;
    const t = tasks.find(
      (x) => x.id === focusParam && x.project_id === projectId
    );
    if (!t) return;
    if (sprintId === null) {
      if (t.sprint_id != null) return;
    } else if (typeof sprintId === "string") {
      if (t.sprint_id !== sprintId) return;
    }
    if (appliedFocusFromUrl.current === focusParam) return;
    setSelectedTaskId(focusParam);
    appliedFocusFromUrl.current = focusParam;
  }, [loading, focusParam, tasks, projectId, sprintId, setSelectedTaskId]);

  React.useEffect(() => {
    if (!highlightTaskId || loading) return;
    const elId = `task-focus-${highlightTaskId}`;
    const scroll = () =>
      document.getElementById(elId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    const t1 = window.setTimeout(scroll, 50);
    const t2 = window.setTimeout(scroll, 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [highlightTaskId, loading, activeView, filteredTasks.length]);

  const activeFilterCount =
    filters.assigneeIds.length +
    filters.priorities.length +
    filters.statuses.length +
    filters.tags.length;

  const toggleSelect = React.useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleTaskClick = React.useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
    },
    [setSelectedTaskId]
  );

  const handleTaskDelete = React.useCallback(
    (taskId: string) => {
      const t = tasks.find((x) => x.id === taskId);
      if (t) setDeleteTarget(t);
    },
    [tasks]
  );

  const handleBulkStatusChange = React.useCallback(
    (status: TaskStatus) => {
      bulkUpdateStatus([...selectedIds], status);
      toast.success(`${selectedIds.size} tasks moved to ${status.replace("_", " ")}`);
      clearSelection();
    },
    [selectedIds, bulkUpdateStatus, clearSelection]
  );

  const handleBulkDelete = React.useCallback(() => {
    bulkDelete([...selectedIds]);
    toast.success(`${selectedIds.size} tasks deleted`);
    clearSelection();
  }, [selectedIds, bulkDelete, clearSelection]);

  const handleBulkMoveToSprint = React.useCallback(
    (toSprintId: string) => {
      const ids = [...selectedIds];
      for (const id of ids) {
        updateTask(id, { sprint_id: toSprintId });
      }
      toast.success(
        ids.length === 1
          ? "Task moved to sprint"
          : `${ids.length} tasks moved to sprint`
      );
      clearSelection();
    },
    [selectedIds, updateTask, clearSelection]
  );

  const handleMoveTaskToSprint = React.useCallback(
    (taskId: string, toSprintId: string) => {
      updateTask(taskId, { sprint_id: toSprintId });
      toast.success("Task moved to sprint");
      setSelectedTaskId(null);
    },
    [updateTask, setSelectedTaskId]
  );

  const handleCreate = React.useCallback(
    (payload: Parameters<typeof createTask>[0]) => {
      createTask(payload);
      toast.success("Task created");
    },
    [createTask]
  );

  const handleUpdate = React.useCallback(
    (id: string, partial: Partial<Task>) => {
      updateTask(id, partial);
      toast.success("Task updated");
    },
    [updateTask]
  );

  const handleConfirmDelete = React.useCallback(
    (taskId: string) => {
      deleteTask(taskId);
      toast.success("Task deleted");
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    },
    [deleteTask, selectedTaskId, setSelectedTaskId]
  );

  const handleStatusChange = React.useCallback(
    (taskId: string, status: TaskStatus) => {
      updateTask(taskId, { status });
    },
    [updateTask]
  );

  const selectedTask = selectedTaskId
    ? tasks.find(
        (t) => t.id === selectedTaskId && t.project_id === projectId
      ) ?? null
    : null;

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !isInput) {
        e.preventDefault();
        setCreateTaskDefaultStatus("todo");
        setCreateOpen(true);
      }
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        document.getElementById("task-search")?.focus();
      }
      if (e.key === "Escape") {
        if (selectedTaskId) setSelectedTaskId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTaskId, setSelectedTaskId]);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="size-9" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-3 rounded-lg border p-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        <TaskBoardToolbar
          boardTitle={boardTitle}
          boardSubtitle={boardSubtitle}
          search={filters.search}
          onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          isFiltersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
          activeFilterCount={activeFilterCount}
          selectedCount={selectedIds.size}
          onBulkStatusChange={handleBulkStatusChange}
          onBulkDelete={handleBulkDelete}
          onClearSelection={clearSelection}
          onCreateTask={() => {
            setCreateTaskDefaultStatus("todo");
            setCreateOpen(true);
          }}
          backlogSprintMoveTargets={
            sprintId === null ? backlogSprintMoveTargets : undefined
          }
          onBulkMoveToSprint={
            sprintId === null ? handleBulkMoveToSprint : undefined
          }
        />

        <TaskFilters
          filters={filters}
          onFiltersChange={setFilters}
          isOpen={filtersOpen}
        />

        {activeView === "kanban" && (
          <KanbanBoard
            tasks={filteredTasks}
            highlightTaskId={highlightTaskId}
            selectedTaskIds={selectedIds}
            onToggleSelect={toggleSelect}
            onTaskClick={handleTaskClick}
            onTaskDelete={handleTaskDelete}
            onTaskStatusChange={handleStatusChange}
            onTaskAssign={assignTask}
            onMoveTask={moveTask}
            onReorderTask={reorderTask}
            onRequestCreateTask={(status) => {
              setCreateTaskDefaultStatus(status);
              setCreateOpen(true);
            }}
          />
        )}

        {activeView === "list" && (
          <TaskListView
            tasks={filteredTasks}
            highlightTaskId={highlightTaskId}
            selectedTaskIds={selectedIds}
            onToggleSelect={toggleSelect}
            onTaskClick={handleTaskClick}
            onTaskDelete={handleTaskDelete}
            onTaskStatusChange={handleStatusChange}
            onTaskAssign={assignTask}
          />
        )}

        {activeView === "table" && (
          <TaskTableView
            tasks={filteredTasks}
            highlightTaskId={highlightTaskId}
            selectedTaskIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={(checked) => {
              if (checked) {
                setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
            onTaskClick={handleTaskClick}
            onTaskDelete={handleTaskDelete}
            onTaskStatusChange={handleStatusChange}
            onTaskAssign={assignTask}
          />
        )}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={selectedTaskId != null}
        onClose={() => setSelectedTaskId(null)}
        onUpdateTask={handleUpdate}
        onDeleteTask={handleConfirmDelete}
        onAddComment={addComment}
        onEditComment={editComment}
        onDeleteComment={deleteComment}
        onAddReply={addReply}
        onAddReaction={addReaction}
        onAppendLoggedHours={appendLoggedHours}
        backlogSprintOptions={
          sprintId === null ? drawerBacklogSprintOptions : undefined
        }
        onMoveTaskToSprint={
          sprintId === null ? handleMoveTaskToSprint : undefined
        }
      />

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
        sprintId={sprintId}
        defaultStatus={createTaskDefaultStatus}
        onCreate={handleCreate}
      />

      <EditTaskModal
        task={editTask}
        open={editTask != null}
        onClose={() => setEditTask(null)}
        onUpdate={handleUpdate}
      />

      <DeleteTaskDialog
        task={deleteTarget}
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
