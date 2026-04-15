"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Inbox, Layers, Plus } from "lucide-react";
import { Toaster, toast } from "sonner";

import { SprintCard } from "@/components/features/sprints/SprintCard";
import { CreateSprintModal } from "@/components/features/sprints/CreateSprintModal";
import { EditSprintModal } from "@/components/features/sprints/EditSprintModal";
import { DeleteSprintDialog } from "@/components/features/sprints/DeleteSprintDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSprints } from "@/hooks/useSprints";
import { useTasks } from "@/hooks/useTasks";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotificationsStore } from "@/store/notifications-store";
import { backlogHref } from "@/lib/constants/sprints";
import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types/sprint.types";

const STATUS_SORT: Record<SprintStatus, number> = {
  active: 0,
  planning: 1,
  completed: 2,
  cancelled: 3,
};

function ProjectBacklogCard({
  projectId,
  taskCount,
  className,
}: {
  projectId: string;
  taskCount: number;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative flex h-full flex-col border-dashed bg-muted/10",
        className
      )}
    >
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              Backlog
            </CardTitle>
            <CardDescription className="line-clamp-2 text-xs">
              Tasks not in a sprint yet. Open the board to triage or move them
              into an iteration.
            </CardDescription>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
            {taskCount} {taskCount === 1 ? "task" : "tasks"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="mt-auto pt-0">
        <Button asChild className="w-full gap-1.5">
          <Link href={backlogHref(projectId)}>
            Open board
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export interface ProjectOverviewPageProps {
  projectId: string;
}

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const {
    sprints: allSprints,
    createSprint,
    updateSprint,
    deleteSprint,
    setSprintStatus,
  } = useSprints();

  const { tasks } = useTasks();
  const { canEditProject } = usePermissions();

  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editSprint, setEditSprint] = React.useState<Sprint | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Sprint | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  const projectSprints = React.useMemo(
    () =>
      allSprints
        .filter((s) => s.project_id === projectId)
        .sort((a, b) => STATUS_SORT[a.status] - STATUS_SORT[b.status] || a.position - b.position),
    [allSprints, projectId]
  );

  const projectTasks = React.useMemo(
    () => tasks.filter((t) => t.project_id === projectId),
    [tasks, projectId]
  );

  const backlogTasks = React.useMemo(
    () => projectTasks.filter((t) => !t.sprint_id),
    [projectTasks]
  );

  const pushNotification = useNotificationsStore((s) => s.push);

  const sprintTaskCounts = React.useMemo(() => {
    const map: Record<string, { total: number; done: number; estH: number; logH: number }> = {};
    for (const s of projectSprints) {
      map[s.id] = { total: 0, done: 0, estH: 0, logH: 0 };
    }
    for (const t of projectTasks) {
      if (t.sprint_id && map[t.sprint_id]) {
        map[t.sprint_id].total += 1;
        if (t.status === "done") map[t.sprint_id].done += 1;
        map[t.sprint_id].estH += t.estimated_hours ?? 0;
        map[t.sprint_id].logH += t.logged_hours ?? 0;
      }
    }
    return map;
  }, [projectSprints, projectTasks]);

  const counts = React.useMemo(() => {
    const c: Record<SprintStatus, number> = { active: 0, planning: 0, completed: 0, cancelled: 0 };
    for (const s of projectSprints) c[s.status] += 1;
    return c;
  }, [projectSprints]);

  const openEdit = (s: Sprint) => {
    setEditSprint(s);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditSprint(null);
  };

  const openDelete = (s: Sprint) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const handleDeleteSprint = React.useCallback(
    (sprintId: string) => {
      deleteSprint(sprintId);
      toast.success("Sprint deleted — tasks moved to backlog");
    },
    [deleteSprint]
  );

  const handleSetStatus = React.useCallback(
    (sprintId: string, status: SprintStatus) => {
      const sprint = allSprints.find((s) => s.id === sprintId);
      setSprintStatus(sprintId, status);
      const label = sprint?.name ?? "Sprint";
      const msg =
        status === "active"
          ? `"${label}" started`
          : status === "completed"
            ? `"${label}" completed`
            : `"${label}" set to ${status}`;
      toast.success(msg);
      pushNotification(msg);
    },
    [allSprints, setSprintStatus, pushNotification]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-52 rounded-xl border border-dashed" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
              <Skeleton className="mt-4 h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" richColors closeButton />

      <CreateSprintModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
        onCreate={(payload) => {
          createSprint(payload);
          toast.success("Sprint created", { description: payload.name });
        }}
      />

      <EditSprintModal
        sprint={editSprint}
        open={editOpen}
        onClose={closeEdit}
        onSave={(id, partial) => {
          updateSprint(id, partial);
          toast.success("Sprint updated");
        }}
      />

      <DeleteSprintDialog
        sprint={deleteTarget}
        open={deleteOpen}
        onClose={closeDelete}
        onConfirm={handleDeleteSprint}
      />

      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Sprints</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage iterations for this project. Tasks live inside sprints or
              the backlog.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="default">Active {counts.active}</Badge>
              <Badge variant="outline">Planning {counts.planning}</Badge>
              <Badge variant="secondary">Completed {counts.completed}</Badge>
            </div>
          </div>
          {canEditProject && (
            <Button
              type="button"
              className="w-full gap-1.5 sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              New sprint
            </Button>
          )}
        </header>

        {projectSprints.length === 0 ? (
          <div className="flex flex-col gap-6">
            <ProjectBacklogCard
              projectId={projectId}
              taskCount={backlogTasks.length}
              className="w-full max-w-sm"
            />
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Layers className="size-6" aria-hidden />
              </div>
              <p className="text-sm font-medium">No sprints yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create your first sprint to start organizing tasks into
                time-boxed iterations.
              </p>
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Create sprint
              </Button>
            </div>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectBacklogCard
              projectId={projectId}
              taskCount={backlogTasks.length}
            />
            {projectSprints.map((sprint) => {
              const c = sprintTaskCounts[sprint.id];
              return (
                <SprintCard
                  key={sprint.id}
                  sprint={sprint}
                  projectId={projectId}
                  taskCount={c?.total ?? 0}
                  doneCount={c?.done ?? 0}
                  totalEstimatedHours={Math.round(c?.estH ?? 0)}
                  totalLoggedHours={Math.round(c?.logH ?? 0)}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onSetStatus={handleSetStatus}
                />
              );
            })}
          </section>
        )}
      </div>
    </>
  );
}
