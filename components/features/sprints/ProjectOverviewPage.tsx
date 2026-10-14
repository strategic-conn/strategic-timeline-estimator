"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  ChevronDown,
  Inbox,
  Layers,
  Link2,
  Plus,
  Upload,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { tourAnchor } from "@/lib/tours/ids";
import {
  ProjectNotFound,
  useProjectMissing,
} from "@/components/features/projects/ProjectNotFound";
import { useProjectsStore } from "@/store/projects-store";
import {
  useProposalEstimatorStore,
  type SchedulePreview,
} from "@/store/proposal-estimator-store";
import { ProjectRiskBufferSection } from "@/components/features/sprints/ProjectRiskBufferSection";
import { ProjectVelocitySection } from "@/components/features/sprints/ProjectVelocitySection";
import { SchedulePreviewPanel } from "@/components/features/proposals/SchedulePreviewPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PUSHABLE_STAGES, zohoPushes } from "@/lib/zoho/push-state";
import { backlogHref } from "@/lib/constants/sprints";
import {
  backlogShareUrl,
  copyTextToClipboard,
  projectShareUrl,
} from "@/lib/utils/share-links";
import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types/sprint.types";
import { AppHelp } from "@/components/common/app-help";

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
      {...tourAnchor("project.backlog")}
    >
      <CardHeader className="gap-2 pb-2">
        {/* See SprintCard: the grid item needs min-w-0 to let the title truncate. */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
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
  const previewSchedule = useProposalEstimatorStore((s) => s.previewSchedule);
  const hydrateProposals = useProposalEstimatorStore(
    (s) => s.hydrateFromSupabase,
  );
  const [syncing, setSyncing] = React.useState(false);
  /** Set once a sync plan has been computed for review (nothing written yet). */
  const [syncPreview, setSyncPreview] = React.useState<SchedulePreview | null>(
    null,
  );
  const [syncStrategy, setSyncStrategy] = React.useState<
    "efficient" | "quick" | undefined
  >(undefined);

  /** Compute + show the plan; the actual write waits for confirmation. */
  const openSyncPreview = (strategy?: "efficient" | "quick") => {
    const p = previewSchedule(projectId, strategy);
    if (!p) {
      toast.error("No estimate is linked to this project.");
      return;
    }
    if (!p.sprints.length && !p.tasks.length && !p.edits.length && !p.removals.length) {
      toast.info("Schedule is already up to date with the estimate.");
      return;
    }
    setSyncStrategy(strategy);
    setSyncPreview(p);
  };

  /**
   * Tell the CRM the work is finished — the final step of the workflow diagram.
   * Explicit, like the proposal push: marking a project complete shouldn't
   * change a CRM record as a side effect.
   */
  const [pushingDone, setPushingDone] = React.useState(false);
  const completionPushedAt =
    zohoPushes(linkedQuote?.zoho)[PUSHABLE_STAGES.projectCompleted] ?? null;

  const pushCompletion = async () => {
    const dealId = linkedQuote?.zoho?.deal_id;
    if (!dealId || !linkedQuote) return;
    setPushingDone(true);
    try {
      const form = new FormData();
      form.append("proposalId", linkedQuote.id);
      form.append("stage", PUSHABLE_STAGES.projectCompleted);
      const res = await fetch(
        `/api/zoho/deals/${encodeURIComponent(dealId)}/push`,
        { method: "POST", body: form },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("Couldn't update Zoho", {
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      if (data?.stageAlreadySet) {
        toast.info("Zoho already knows", {
          description: "This project was already marked complete in the CRM.",
        });
      } else {
        toast.success("Zoho updated", {
          description: 'The deal moved to "Project Completed".',
        });
      }
      await hydrateProposals();
    } catch (e) {
      toast.error("Couldn't update Zoho", {
        description: e instanceof Error ? e.message : "Unexpected error.",
      });
    } finally {
      setPushingDone(false);
    }
  };

  const confirmSync = async () => {
    setSyncing(true);
    // Persist exactly what was reviewed.
    await regenerateSchedule(projectId, syncStrategy, syncPreview);
    setSyncing(false);
    setSyncPreview(null);
  };
  const projectRecord = useProjectsStore((s) =>
    s.projects.find((p) => p.id === projectId)
  );
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const projectMissing = useProjectMissing(projectId);
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

  /**
   * The project isn't there — deleted, or never existed.
   *
   * Reachable by design, not just by a bad URL: deleting a project writes an
   * activity entry whose href is that project's own overview page, so every
   * "Deleted project X" line in the feed leads straight here. Without this the
   * page rendered as a working project with a raw id for a name and offered
   * "New sprint" — and that insert can only fail, because sprints carry a
   * foreign key to a row that is gone.
   *
   * Safe to key off `loading` being finished: in live mode that already waits
   * on `projectsLoaded`, so an empty lookup here means absent, not pending.
   */
  if (projectMissing) return <ProjectNotFound />;

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

      <Dialog
        open={syncPreview != null}
        onOpenChange={(v) => !v && setSyncPreview(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review the schedule</DialogTitle>
            <DialogDescription>
              Nothing has been created yet. This is exactly what will be added to
              this project when you confirm — existing sprints and tasks are left
              untouched.
            </DialogDescription>
          </DialogHeader>
          {syncPreview ? <SchedulePreviewPanel preview={syncPreview} /> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSyncPreview(null)}
              disabled={syncing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmSync()}
              disabled={syncing}
              className="gap-1.5"
            >
              <CalendarRange className="size-4" aria-hidden />
              {syncing ? "Applying…" : "Confirm & apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6">
        <WorkspacePageHeader
          eyebrow={projectLabel}
          help={<AppHelp section="page.project" />}
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
              {/* Closes the loop: only for a CRM-linked project that's actually
                  finished. Hidden otherwise rather than shown disabled. */}
              {linkedQuote?.zoho?.deal_id &&
              canExportProposals &&
              projectRecord?.status === "completed" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full gap-1.5 border-border/60 bg-background/80 lg:w-auto"
                  disabled={pushingDone || Boolean(completionPushedAt)}
                  onClick={() => void pushCompletion()}
                  {...tourAnchor("project.zoho-complete")}
                  title={
                    completionPushedAt
                      ? `Zoho notified ${new Date(completionPushedAt).toLocaleString()}`
                      : 'Move the linked Zoho deal to "Project Completed"'
                  }
                >
                  <Upload className="size-4" aria-hidden />
                  {completionPushedAt
                    ? "Zoho notified"
                    : pushingDone
                      ? "Updating Zoho…"
                      : "Mark complete in Zoho"}
                </Button>
              ) : null}

              {linkedQuote && canExportProposals ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full gap-1.5 border-border/60 bg-background/80 lg:w-auto"
                      disabled={syncing}
                      {...tourAnchor("project.sync")}
                    >
                      <CalendarRange className="size-4" aria-hidden />
                      {syncing ? "Syncing…" : "Sync schedule from estimate"}
                      <ChevronDown className="size-4 opacity-70" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem onSelect={() => openSyncPreview("efficient")}>
                      <span className="flex flex-col">
                        <span className="font-medium">Best-fit &amp; auto-assign</span>
                        <span className="text-xs text-muted-foreground">
                          Highest-skilled available person per task
                        </span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openSyncPreview("quick")}>
                      <span className="flex flex-col">
                        <span className="font-medium">Fastest &amp; auto-assign</span>
                        <span className="text-xs text-muted-foreground">
                          Spread across qualified devs to finish soonest
                        </span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openSyncPreview(undefined)}>
                      <span className="flex flex-col">
                        <span className="font-medium">Dates only</span>
                        <span className="text-xs text-muted-foreground">
                          Fill missing sprints/tasks, don&apos;t assign anyone
                        </span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {canEditProject ? (
                <Button
                  type="button"
                  className="h-9 w-full gap-1.5 lg:w-auto"
                  onClick={() => setCreateOpen(true)}
                  {...tourAnchor("project.new-sprint")}
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
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center"
              {...tourAnchor("project.empty")}
            >
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
          <section
            className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
            {...tourAnchor("project.sprints")}
          >
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
          <section className="flex flex-col gap-3" {...tourAnchor("project.timeline")}>
            <div className="relative space-y-1 sm:pr-9">
              <AppHelp section="project.timeline" className="absolute right-0 top-0" />
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight max-sm:pr-8">
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
            {/* Under the chart on purpose: the forecast only means something
                once you can see the schedule it is stretching. Admin/manager
                only — it rewrites the dates the team works to. */}
            {canEditProject ? (
              <ProjectRiskBufferSection projectId={projectId} />
            ) : null}
          </section>
        ) : null}

        {projectSprints.length > 0 ? (
          <ProjectVelocitySection projectId={projectId} />
        ) : null}
      </div>
    </>
  );
}
