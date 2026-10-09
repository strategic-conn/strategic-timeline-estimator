"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import type { Project } from "@/types/project.types";

export interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (projectId: string) => void;
}

/**
 * Says exactly what goes (CLAUDE.md rule 6). The old copy said "from your local
 * list … tasks unchanged" — written for the demo. In the live app deleting a
 * project cascades to every sprint, task, assignment and comment, and to the
 * time people LOGGED on those tasks (time_entries is on-delete-cascade), so
 * worked hours vanish from Workload and Reports for good.
 */
export function DeleteProjectDialog({
  project,
  open,
  onClose,
  onConfirm,
}: DeleteProjectDialogProps) {
  const sprints = useSprintsStore((s) => s.sprints);
  const tasks = useTasksDataStore((s) => s.tasks);
  const proposals = useProposalEstimatorStore((s) => s.proposals);

  const impact = React.useMemo(() => {
    if (!project) return null;
    const projectTasks = tasks.filter((t) => t.project_id === project.id);
    const loggedHours =
      Math.round(projectTasks.reduce((sum, t) => sum + (t.logged_hours ?? 0), 0) * 10) / 10;
    const estimate = proposals.find((q) => q.project_id === project.id);
    return {
      sprints: sprints.filter((s) => s.project_id === project.id).length,
      tasks: projectTasks.length,
      loggedHours,
      estimate: estimate?.title ?? null,
      poNo: estimate?.pbs?.po_no ?? null,
    };
  }, [project, sprints, tasks, proposals]);

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <AlertDialog
      open={open && project != null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {project?.name ?? "this project"}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This permanently deletes the project and everything in it
                {impact
                  ? `: ${plural(impact.sprints, "sprint")} and ${plural(impact.tasks, "task")}, with their assignments and comments.`
                  : "."}
              </p>
              {impact && impact.loggedHours > 0 ? (
                <p className="font-medium text-destructive">
                  {`${impact.loggedHours} h of logged time will be erased from Workload and Reports. If the work is finished, mark the project Completed or Archived instead.`}
                </p>
              ) : null}
              {impact?.estimate ? (
                <p>
                  {`The estimate "${impact.estimate}" stays, but loses its link to this project${impact.poNo ? ` — and it already has PO ${impact.poNo} in PBS, which can't be deleted from here` : ""}.`}
                </p>
              ) : null}
              <p>This can&apos;t be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (project) {
                onConfirm(project.id);
                onClose();
              }
            }}
          >
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
