"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  Inbox,
  Layers,
  Link2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { GanttClient } from "@/components/features/gantt/GanttClient";
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
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { backlogHref } from "@/lib/constants/sprints";
import {
  backlogShareUrl,
  copyTextToClipboard,
  projectShareUrl,
} from "@/lib/utils/share-links";
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
      <CardContent className="mt-auto flex flex-col gap-2 pt-0 sm:flex-row">
        <Button asChild className="w-full flex-1 gap-1.5">
          <Link href={backlogHref(projectId)}>
            Open board
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 gap-1.5 sm:w-auto"
          onClick={async () => {
            const ok = await copyTextToClipboard(backlogShareUrl(projectId));
            if (ok) {
              toast.success("Backlog link copied", {
                description: "Opens the backlog board for this project.",
              });
            } else {
              toast.error("Could not copy link");
            }
          }}
        >
          <Link2 className="size-4" aria-hidden />
          Copy link
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
    loaded: sprintsLoaded,
    error: sprintsError,
    hydrateFromSupabase: hydrateSprints,
  } = useSprints();

  const { tasks } = useTasks();
  const { canEditProject, canExportProposals } = usePermissions();
  const linkedQuote = useProposalEstimatorStore((s) =>
    s.proposals.find((p) => p.project_id === projectId)
  );
  const regenerateSchedule = useProposalEstimatorStore(
    (s) => s.regenerateSchedule
  );
  const [syncing, setSyncing] = React.useState(false);
  const projectRecord = useProjectsStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const projectLabel = projectRecord?.name ?? "Project";

  // Demo shows a brief skeleton; live mode waits on the synced stores.
  const [demoSettling, setDemoSettling] = React.useState(!isSupabaseConfigured);
  const loading = isSupabaseConfigured
    ? !sprintsLoaded || !projectsLoaded
    : demoSettling;
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editSprint, setEditSprint] = React.useState<Sprint | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Sprint | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    if (isSupabaseConfigured) return;
    const t = setTimeout(() => setDemoSettling(false), 300);
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
    },
    [deleteSprint]
  );

  const handleSetStatus = React.useCallback(
    (sprintId: string, status: SprintStatus) => {
      setSprintStatus(sprintId, status);
    },
    [setSprintStatus]
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

  if (sprintsError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Layers className="size-6" aria-hidden />
        </div>
        <p className="text-sm font-medium">Couldn&apos;t load sprints</p>
        <p className="max-w-sm text-sm text-muted-foreground">{sprintsError}</p>
        <Button type="button" variant="outline" onClick={() => void hydrateSprints()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <CreateSprintModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={projectId}
        onCreate={(payload) => {
          createSprint(payload);
        }}
      />

      <EditSprintModal
        sprint={editSprint}
        open={editOpen}
        onClose={closeEdit}
        onSave={(id, partial) => {
          updateSprint(id, partial);
        }}
      />

      <DeleteSprintDialog
        sprint={deleteTarget}
        open={deleteOpen}
        onClose={closeDelete}
        onConfirm={handleDeleteSprint}
      />

      <div className="flex flex-col gap-6">
        <WorkspacePageHeader
          eyebrow={projectLabel}
          title="Sprints & backlog"
          description="Manage iterations for this project. Tasks live inside sprints or the backlog."
          meta={
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button variant="outline" size="sm" className="w-fit gap-1.5 border-border/60 bg-background/80" asChild>
                <Link href={`/projects/${projectId}/activity`}>
                  <Activity className="size-4" aria-hidden />
                  Activity feed
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Active {counts.active}</Badge>
                <Badge variant="outline">Planning {counts.planning}</Badge>
                <Badge variant="secondary">Completed {counts.completed}</Badge>
              </div>
            </div>
          }
          actions={
            <div className="flex w-full flex-col gap-2 lg:flex-row lg:flex-wrap lg:justify-end lg:gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full gap-1.5 border-border/60 bg-background/80 lg:w-auto"
                onClick={async () => {
                  const ok = await copyTextToClipboard(
                    projectShareUrl(projectId)
                  );
                  if (ok) {
                    toast.success("Project link copied", {
                      description: "Opens sprints and backlog for this project.",
                    });
                  } else {
                    toast.error("Could not copy link");
                  }
                }}
              >
                <Link2 className="size-4" aria-hidden />
                Copy project link
              </Button>
              {linkedQuote && canExportProposals ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full gap-1.5 border-border/60 bg-background/80 lg:w-auto"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    await regenerateSchedule(projectId);
                    setSyncing(false);
                  }}
                >
                  <CalendarRange className="size-4" aria-hidden />
                  {syncing ? "Syncing…" : "Sync schedule from estimate"}
                </Button>
              ) : null}
              {canEditProject ? (
                <Button
                  type="button"
                  className="h-9 w-full gap-1.5 lg:w-auto"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  New sprint
                </Button>
              ) : null}
            </div>
          }
        />

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
                {canEditProject
                  ? "Create your first sprint to start organizing tasks into time-boxed iterations."
                  : "No sprints yet. An admin or manager can create the first one."}
              </p>
              {canEditProject ? (
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Create sprint
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <section className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
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

        {projectSprints.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
                <CalendarRange
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                Timeline
              </h2>
              <p className="text-xs text-muted-foreground">
                Draft schedule from the estimate. Adjust each sprint&apos;s dates
                (and assign tasks) to shape the plan the team follows.
              </p>
            </div>
            <GanttClient lockedProjectId={projectId} />
          </section>
        ) : null}
      </div>
    </>
  );
}
