"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import * as React from "react";

import { KanbanColumn } from "@/components/features/tasks/KanbanColumn";
import { cn } from "@/lib/utils";
import {
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from "@/types/task.types";

export interface KanbanBoardProps {
  tasks: Task[];
  selectedTaskIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskAssign: (taskId: string, userId: number | null) => void;
  onMoveTask: (
    taskId: string,
    toStatus: TaskStatus,
    toIndex: number
  ) => void;
  onReorderTask: (
    taskId: string,
    fromIndex: number,
    toIndex: number,
    status: TaskStatus
  ) => void;
  onRequestCreateTask: (status: TaskStatus) => void;
}

function groupByStatusSorted(tasks: Task[]): Record<TaskStatus, Task[]> {
  const map = TASK_STATUSES.reduce(
    (acc, { value }) => {
      acc[value] = [];
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );
  for (const t of tasks) {
    if (map[t.status]) map[t.status].push(t);
  }
  for (const s of TASK_STATUSES) {
    map[s.value].sort((a, b) => a.position - b.position);
  }
  return map;
}

function findTask(tasks: Task[], id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

function parseColumnDroppableId(id: string): TaskStatus | null {
  return TASK_STATUSES.some((s) => s.value === id)
    ? (id as TaskStatus)
    : null;
}

function resolveOverLocation(
  tasks: Task[],
  grouped: Record<TaskStatus, Task[]>,
  overId: string,
  activeId: string
): { status: TaskStatus; index: number } | null {
  const columnStatus = parseColumnDroppableId(overId);
  if (columnStatus) {
    const col = grouped[columnStatus].filter((t) => t.id !== activeId);
    return { status: columnStatus, index: col.length };
  }
  const overTask = findTask(tasks, overId);
  if (!overTask) return null;
  const col = grouped[overTask.status];
  const indexInFull = col.findIndex((t) => t.id === overId);
  if (indexInFull < 0) return null;
  return { status: overTask.status, index: indexInFull };
}

export function KanbanBoard({
  tasks,
  selectedTaskIds,
  onToggleSelect,
  onTaskClick,
  onTaskDelete,
  onTaskStatusChange,
  onTaskAssign,
  onMoveTask,
  onReorderTask,
  onRequestCreateTask,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const dragStartRef = React.useRef<{
    taskId: string;
    status: TaskStatus;
    index: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const grouped = React.useMemo(() => groupByStatusSorted(tasks), [tasks]);

  const activeTask = activeId ? findTask(tasks, activeId) : undefined;

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const task = findTask(tasks, id);
    if (!task) {
      dragStartRef.current = null;
      return;
    }
    const col = grouped[task.status];
    dragStartRef.current = {
      taskId: id,
      status: task.status,
      index: col.findIndex((t) => t.id === id),
    };
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const activeTask = findTask(tasks, activeIdStr);
    if (!activeTask) return;

    const g = groupByStatusSorted(tasks);
    const dest = resolveOverLocation(tasks, g, overIdStr, activeIdStr);
    if (!dest) return;

    if (dest.status === activeTask.status) return;

    onMoveTask(activeIdStr, dest.status, dest.index);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    const start = dragStartRef.current;
    dragStartRef.current = null;

    if (!over || !start) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const g = groupByStatusSorted(tasks);
    const dest = resolveOverLocation(tasks, g, overIdStr, activeIdStr);
    if (!dest) return;

    if (start.status === dest.status) {
      const column = g[dest.status];
      const fromIndex = column.findIndex((t) => t.id === activeIdStr);
      if (fromIndex < 0) return;

      let toIndex: number;
      if (parseColumnDroppableId(overIdStr)) {
        toIndex = Math.max(0, column.length - 1);
      } else {
        const overIndex = column.findIndex((t) => t.id === overIdStr);
        if (overIndex < 0) return;
        const curIndex = column.findIndex((t) => t.id === activeIdStr);
        if (curIndex < overIndex) {
          toIndex = overIndex - 1;
        } else {
          toIndex = overIndex;
        }
      }

      const ids = column.map((t) => t.id);
      const reordered = arrayMove(ids, fromIndex, toIndex);
      const finalTo = reordered.indexOf(activeIdStr);
      if (start.index !== finalTo) {
        onReorderTask(activeIdStr, start.index, finalTo, dest.status);
      }
      return;
    }

    onMoveTask(activeIdStr, dest.status, dest.index);
  }

  function handleDragCancel() {
    setActiveId(null);
    dragStartRef.current = null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={cn(
          "flex gap-4 overflow-x-auto p-1 pb-3",
          "snap-x snap-mandatory md:snap-none"
        )}
      >
        {TASK_STATUSES.map((col) => (
          <KanbanColumn
            key={col.value}
            status={col.value}
            tasks={grouped[col.value]}
            selectedTaskIds={selectedTaskIds}
            onToggleSelect={onToggleSelect}
            onTaskClick={onTaskClick}
            onTaskDelete={onTaskDelete}
            onTaskStatusChange={onTaskStatusChange}
            onTaskAssign={onTaskAssign}
            onRequestCreateTask={onRequestCreateTask}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rounded-lg border bg-card p-3 text-sm font-medium shadow-lg opacity-90">
            {activeTask.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
