"use client";

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
import type { Project } from "@/types/project.types";

export interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (projectId: string) => void;
}

export function DeleteProjectDialog({
  project,
  open,
  onClose,
  onConfirm,
}: DeleteProjectDialogProps) {
  return (
    <AlertDialog
      open={open && project != null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove{" "}
            <span className="font-medium text-foreground">
              {project?.name ?? "this project"}
            </span>{" "}
            from your local list. Tasks for this project in the demo board are
            unchanged. This cannot be undone here.
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
